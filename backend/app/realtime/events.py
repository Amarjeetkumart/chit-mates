from __future__ import annotations

import logging
from typing import Any, Dict
from urllib.parse import parse_qs

from socketio.exceptions import ConnectionRefusedError

from app.db.session import SessionLocal
from app.models.enums import GameStatus
from app.realtime.chat_manager import chat_manager
from app.realtime.server import sio
from app.realtime.voice_manager import voice_manager
from app.services.room_service import RoomService

logger = logging.getLogger(__name__)


async def _resolve_player(room_code: str, player_id: str):
    async with SessionLocal() as session:
        service = RoomService(session)
        room = await service.get_room_by_code(room_code)
        player = next((rp for rp in room.players if str(rp.id) == player_id), None)
        if player is None:
            raise ValueError("Player not found in room")
        return room, player


async def _is_match_active(room_code: str) -> bool:
    async with SessionLocal() as session:
        service = RoomService(session)
        room = await service.get_room_by_code(room_code)
        return any(game.status == GameStatus.IN_PROGRESS for game in room.games)


def _extract_auth(environ: dict[str, Any], auth: dict[str, Any] | None) -> tuple[str, str]:
    auth_payload = auth or {}
    room_code = auth_payload.get("roomCode") or auth_payload.get("room_code")
    player_id = auth_payload.get("playerId") or auth_payload.get("player_id")
    if room_code and player_id:
        return str(room_code), str(player_id)

    query = parse_qs(environ.get("QUERY_STRING", ""))
    room_vals = query.get("roomCode") or query.get("room_code")
    player_vals = query.get("playerId") or query.get("player_id")
    if room_vals and player_vals:
        return room_vals[0], player_vals[0]

    raise ConnectionRefusedError("Missing room or player information")


@sio.event
async def connect(sid: str, environ: dict[str, Any], auth: dict[str, Any] | None) -> None:
    room_code, player_id = _extract_auth(environ, auth)
    try:
        room, player = await _resolve_player(room_code, player_id)
    except ValueError as exc:
        logger.warning("Socket connection refused for room %s: %s", room_code, exc)
        raise ConnectionRefusedError("Unauthorized") from exc

    display_name = player.user.display_name
    session_data: dict[str, Any] = {
        "room_code": room_code,
        "player_id": player_id,
        "display_name": display_name,
    }
    await sio.save_session(sid, session_data)
    await sio.enter_room(sid, room_code)

    is_new = await chat_manager.register_member(room_code, player_id, display_name, sid)
    history = await chat_manager.get_history(room_code)
    if history:
        await sio.emit("chat:history", history, room=sid)

    if is_new:
        system_message = await chat_manager.add_system_message(
            room_code,
            display_name,
            system_event="join",
            content=f"{display_name} joined the room",
            player_id=player_id,
        )
        await sio.emit("chat:message", system_message, room=room_code)

    logger.debug("Socket connected: sid=%s room=%s player=%s", sid, room_code, player_id)


@sio.event
async def disconnect(sid: str) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        logger.debug("Socket disconnect without session: %s", sid)
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    display_name = session.get("display_name", "")
    if not room_code or not player_id:
        return

    left_chat, chat_name = await chat_manager.unregister_sid(room_code, player_id, sid)
    if left_chat:
        system_message = await chat_manager.add_system_message(
            room_code,
            chat_name or display_name,
            system_event="leave",
            content=f"{chat_name or display_name} left the room",
            player_id=player_id,
        )
        await sio.emit("chat:message", system_message, room=room_code)

    removed_voice, _ = await voice_manager.unregister_sid(room_code, player_id, sid)
    if removed_voice:
        participants = await voice_manager.list_participants(room_code)
        await sio.emit("voice:participants", {"participants": participants}, room=room_code)

    logger.debug("Socket disconnected: sid=%s room=%s player=%s", sid, room_code, player_id)


@sio.on("chat:message")
async def handle_chat_message(sid: str, data: Dict[str, Any]) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    display_name = session.get("display_name", "")
    if not room_code or not player_id:
        return

    content = (data or {}).get("content", "")
    if not isinstance(content, str) or not content.strip():
        return

    message_payload, retry_after = await chat_manager.add_user_message(room_code, player_id, display_name, content)
    if message_payload is None:
        await sio.emit("chat:rate_limited", {"retryAfter": retry_after}, room=sid)
        return

    await chat_manager.clear_typing(room_code, player_id)
    await sio.emit("chat:message", message_payload, room=room_code)


@sio.on("chat:typing")
async def handle_chat_typing(sid: str, data: Dict[str, Any]) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    if not room_code or not player_id:
        return

    is_typing = bool((data or {}).get("isTyping"))
    typing_payload = await chat_manager.set_typing(room_code, player_id, is_typing)
    await sio.emit("chat:typing", {"players": typing_payload}, room=room_code)


@sio.on("voice:ready")
async def handle_voice_ready(sid: str) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    display_name = session.get("display_name", "")
    if not room_code or not player_id:
        return

    if not await _is_match_active(room_code):
        await sio.emit("voice:inactive", {"reason": "match_inactive"}, room=sid)
        return

    await voice_manager.register_participant(room_code, player_id, display_name, sid)
    participants = await voice_manager.list_participants(room_code)
    await sio.emit("voice:participants", {"participants": participants}, room=room_code)


@sio.on("voice:offer")
async def handle_voice_offer(sid: str, data: Dict[str, Any]) -> None:
    await _relay_voice_signal(sid, data, event_name="voice:offer")


@sio.on("voice:answer")
async def handle_voice_answer(sid: str, data: Dict[str, Any]) -> None:
    await _relay_voice_signal(sid, data, event_name="voice:answer")


@sio.on("voice:ice-candidate")
async def handle_voice_candidate(sid: str, data: Dict[str, Any]) -> None:
    await _relay_voice_signal(sid, data, event_name="voice:ice-candidate")


async def _relay_voice_signal(sid: str, data: Dict[str, Any], event_name: str) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    if not room_code or not player_id:
        return

    target_player = (data or {}).get("targetPlayerId")
    payload = {k: v for k, v in (data or {}).items() if k != "targetPlayerId"}
    payload["fromPlayerId"] = player_id
    if not target_player:
        return

    target_sids = await voice_manager.get_sids_for_target(room_code, str(target_player))
    for target_sid in target_sids:
        await sio.emit(event_name, payload, room=target_sid)


@sio.on("voice:mute")
async def handle_voice_mute(sid: str, data: Dict[str, Any]) -> None:
    await _update_voice_state(sid, data, muted_key="isMuted", auto=False)


@sio.on("voice:auto-mute")
async def handle_voice_auto_mute(sid: str, data: Dict[str, Any]) -> None:
    await _update_voice_state(sid, data, muted_key="isMuted", auto=True)


@sio.on("voice:push-to-talk")
async def handle_voice_push(sid: str, data: Dict[str, Any]) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    if not room_code or not player_id:
        return

    pressed = bool((data or {}).get("isPressed"))
    payload = await voice_manager.update_push_to_talk(room_code, player_id, pressed)
    if payload:
        await sio.emit("voice:status", payload, room=room_code)


@sio.on("voice:leave")
async def handle_voice_leave(sid: str) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    if not room_code or not player_id:
        return

    removed, _ = await voice_manager.unregister_sid(room_code, player_id, sid)
    if removed:
        participants = await voice_manager.list_participants(room_code)
        await sio.emit("voice:participants", {"participants": participants}, room=room_code)


async def _update_voice_state(sid: str, data: Dict[str, Any], *, muted_key: str, auto: bool) -> None:
    try:
        session = await sio.get_session(sid)
    except KeyError:
        return

    room_code = session.get("room_code")
    player_id = session.get("player_id")
    if not room_code or not player_id:
        return

    muted = bool((data or {}).get(muted_key, True))
    payload = await voice_manager.update_mute(room_code, player_id, muted=muted, auto=auto)
    if payload:
        await sio.emit("voice:status", payload, room=room_code)


async def trigger_voice_shutdown(room_code: str, *, reason: str = "match_complete") -> None:
    participants = await voice_manager.list_participants(room_code)
    if not participants:
        return
    await voice_manager.remove_room(room_code)
    await sio.emit("voice:shutdown", {"reason": reason}, room=room_code)
    await sio.emit("voice:participants", {"participants": []}, room=room_code)

