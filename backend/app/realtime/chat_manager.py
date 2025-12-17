from __future__ import annotations

import asyncio
import re
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict, Iterable, List, Optional
from uuid import uuid4

from app.core.config import settings

MAX_MESSAGE_LENGTH = 500
_TYPING_TIMEOUT = timedelta(seconds=6)


@dataclass
class MemberState:
    display_name: str
    sids: set[str] = field(default_factory=set)


@dataclass
class ChatMessage:
    id: str
    room_code: str
    player_id: str | None
    display_name: str
    content: str
    timestamp: datetime
    message_type: str
    system_event: str | None = None

    def as_payload(self) -> dict[str, Optional[str]]:
        return {
            "id": self.id,
            "roomCode": self.room_code,
            "playerId": self.player_id,
            "displayName": self.display_name,
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "type": self.message_type,
            "systemEvent": self.system_event,
        }


class ChatRoomState:
    def __init__(self, history_limit: int) -> None:
        self.members: Dict[str, MemberState] = {}
        self.history: Deque[ChatMessage] = deque(maxlen=history_limit)
        self.typing: dict[str, datetime] = {}
        self.rate_timestamps: dict[str, Deque[datetime]] = {}


class ChatManager:
    def __init__(
        self,
        history_limit: int,
        rate_limit_count: int,
        rate_limit_window: timedelta,
        profanity_blocklist: Iterable[str],
    ) -> None:
        self._history_limit = history_limit
        self._rate_limit_count = rate_limit_count
        self._rate_limit_window = rate_limit_window
        self._rooms: Dict[str, ChatRoomState] = {}
        self._lock = asyncio.Lock()
        self._profanity_patterns = [re.compile(rf"\b{re.escape(word)}\b", flags=re.IGNORECASE) for word in profanity_blocklist]

    async def register_member(self, room_code: str, player_id: str, display_name: str, sid: str) -> bool:
        async with self._lock:
            room = self._ensure_room(room_code)
            member = room.members.setdefault(player_id, MemberState(display_name=display_name))
            before = len(member.sids)
            member.sids.add(sid)
            return before == 0

    async def unregister_sid(self, room_code: str, player_id: str, sid: str) -> tuple[bool, str]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return False, ""
            member = room.members.get(player_id)
            if not member:
                return False, ""
            member.sids.discard(sid)
            if member.sids:
                return False, member.display_name
            room.members.pop(player_id, None)
            room.typing.pop(player_id, None)
            room.rate_timestamps.pop(player_id, None)
            is_room_empty = not room.members
            if is_room_empty:
                self._rooms.pop(room_code, None)
            return True, member.display_name

    async def add_user_message(
        self,
        room_code: str,
        player_id: str,
        display_name: str,
        raw_content: str,
    ) -> tuple[dict[str, Optional[str]] | None, float]:
        async with self._lock:
            room = self._ensure_room(room_code)
            limited, retry_after = self._is_rate_limited(room, player_id)
            if limited:
                return None, retry_after

            content = self._sanitize_message(raw_content)
            message = ChatMessage(
                id=str(uuid4()),
                room_code=room_code,
                player_id=player_id,
                display_name=display_name,
                content=content,
                timestamp=datetime.now(tz=timezone.utc),
                message_type="user",
            )
            room.history.append(message)
            room.typing.pop(player_id, None)
            return message.as_payload(), 0.0

    async def add_system_message(
        self,
        room_code: str,
        display_name: str,
        system_event: str,
        content: str,
        player_id: str | None = None,
    ) -> dict[str, Optional[str]]:
        async with self._lock:
            room = self._ensure_room(room_code)
            message = ChatMessage(
                id=str(uuid4()),
                room_code=room_code,
                player_id=player_id,
                display_name=display_name,
                content=content,
                timestamp=datetime.now(tz=timezone.utc),
                message_type="system",
                system_event=system_event,
            )
            room.history.append(message)
            return message.as_payload()

    async def get_history(self, room_code: str) -> list[dict[str, Optional[str]]]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return []
            return [message.as_payload() for message in room.history]

    async def set_typing(self, room_code: str, player_id: str, is_typing: bool) -> list[dict[str, str]]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return []
            if is_typing:
                room.typing[player_id] = datetime.now(tz=timezone.utc)
            else:
                room.typing.pop(player_id, None)
            self._purge_expired_typing(room)
            return self._typing_payloads(room)

    async def clear_typing(self, room_code: str, player_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return
            room.typing.pop(player_id, None)

    def _ensure_room(self, room_code: str) -> ChatRoomState:
        room = self._rooms.get(room_code)
        if room is None:
            room = ChatRoomState(history_limit=self._history_limit)
            self._rooms[room_code] = room
        return room

    def _sanitize_message(self, content: str) -> str:
        trimmed = content.strip()
        truncated = trimmed[:MAX_MESSAGE_LENGTH]
        sanitized = truncated
        for pattern in self._profanity_patterns:
            sanitized = pattern.sub(lambda match: "*" * len(match.group()), sanitized)
        return sanitized

    def _is_rate_limited(self, room: ChatRoomState, player_id: str) -> tuple[bool, float]:
        now = datetime.now(tz=timezone.utc)
        history = room.rate_timestamps.setdefault(player_id, deque())
        window_start = now - self._rate_limit_window
        while history and history[0] < window_start:
            history.popleft()
        if len(history) >= self._rate_limit_count:
            retry_after = (history[0] + self._rate_limit_window - now).total_seconds()
            return True, max(retry_after, 0.5)
        history.append(now)
        return False, 0.0

    def _purge_expired_typing(self, room: ChatRoomState) -> None:
        now = datetime.now(tz=timezone.utc)
        expired = [player_id for player_id, started_at in room.typing.items() if now - started_at > _TYPING_TIMEOUT]
        for player_id in expired:
            room.typing.pop(player_id, None)

    def _typing_payloads(self, room: ChatRoomState) -> list[dict[str, str]]:
        payloads: list[dict[str, str]] = []
        for player_id in room.typing.keys():
            member = room.members.get(player_id)
            if not member:
                continue
            payloads.append({"playerId": player_id, "displayName": member.display_name})
        return payloads


def _lowercase_blocklist(words: Iterable[str]) -> list[str]:
    return [word.strip().lower() for word in words if word.strip()]


chat_manager = ChatManager(
    history_limit=settings.chat_history_limit,
    rate_limit_count=settings.chat_rate_limit_count,
    rate_limit_window=timedelta(seconds=settings.chat_rate_limit_window_seconds),
    profanity_blocklist=_lowercase_blocklist(settings.chat_profanity_blocklist),
)
