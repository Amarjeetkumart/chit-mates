from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set


@dataclass
class VoiceParticipant:
    player_id: str
    display_name: str
    sids: set[str] = field(default_factory=set)
    is_muted: bool = True
    is_auto_muted: bool = False
    push_to_talk_pressed: bool = False
    last_active: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))

    def payload(self) -> dict[str, object]:
        return {
            "playerId": self.player_id,
            "displayName": self.display_name,
            "isMuted": self.is_muted,
            "isAutoMuted": self.is_auto_muted,
            "pushToTalkPressed": self.push_to_talk_pressed,
        }


@dataclass
class VoiceRoomState:
    participants: Dict[str, VoiceParticipant] = field(default_factory=dict)


class VoiceManager:
    def __init__(self) -> None:
        self._rooms: Dict[str, VoiceRoomState] = {}
        self._lock = asyncio.Lock()

    async def register_participant(self, room_code: str, player_id: str, display_name: str, sid: str) -> tuple[VoiceParticipant, bool]:
        async with self._lock:
            room = self._rooms.setdefault(room_code, VoiceRoomState())
            participant = room.participants.get(player_id)
            if participant is None:
                participant = VoiceParticipant(player_id=player_id, display_name=display_name)
                room.participants[player_id] = participant
            else:
                participant.display_name = display_name
            before = len(participant.sids)
            participant.sids.add(sid)
            participant.last_active = datetime.now(tz=timezone.utc)
            return participant, before == 0

    async def unregister_sid(self, room_code: str, player_id: str, sid: str) -> tuple[bool, str]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return False, ""
            participant = room.participants.get(player_id)
            if not participant:
                return False, ""
            participant.sids.discard(sid)
            if participant.sids:
                return False, participant.display_name
            room.participants.pop(player_id, None)
            if not room.participants:
                self._rooms.pop(room_code, None)
            return True, participant.display_name

    async def list_participants(self, room_code: str) -> list[dict[str, object]]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return []
            return [participant.payload() for participant in room.participants.values()]

    async def update_mute(self, room_code: str, player_id: str, *, muted: bool, auto: bool) -> Optional[dict[str, object]]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return None
            participant = room.participants.get(player_id)
            if not participant:
                return None
            if auto:
                participant.is_auto_muted = muted
            else:
                participant.is_muted = muted
            participant.last_active = datetime.now(tz=timezone.utc)
            return participant.payload()

    async def update_push_to_talk(self, room_code: str, player_id: str, pressed: bool) -> Optional[dict[str, object]]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return None
            participant = room.participants.get(player_id)
            if not participant:
                return None
            participant.push_to_talk_pressed = pressed
            participant.last_active = datetime.now(tz=timezone.utc)
            return participant.payload()

    async def get_sids_for_target(self, room_code: str, player_id: str) -> Set[str]:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return set()
            participant = room.participants.get(player_id)
            if not participant:
                return set()
            return set(participant.sids)

    async def remove_room(self, room_code: str) -> List[str]:
        async with self._lock:
            room = self._rooms.pop(room_code, None)
            if not room:
                return []
            return [participant.display_name for participant in room.participants.values()]

    async def clear_participant(self, room_code: str, player_id: str) -> None:
        async with self._lock:
            room = self._rooms.get(room_code)
            if not room:
                return
            room.participants.pop(player_id, None)
            if not room.participants:
                self._rooms.pop(room_code, None)


voice_manager = VoiceManager()
