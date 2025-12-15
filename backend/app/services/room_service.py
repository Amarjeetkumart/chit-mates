from __future__ import annotations

import uuid
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import PlayerPosition, Room, RoomPlayer, RoomStatus, User
from app.schemas.room import RoomCreateRequest, RoomJoinRequest
from app.schemas.user import UserCreate
from app.services.utils import generate_room_code


class RoomService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_room(self, payload: RoomCreateRequest) -> tuple[Room, RoomPlayer]:
        user = await self._get_or_create_user(payload.host_display_name)
        room = await self._create_unique_room(user.id, payload.total_rounds)
        host_player = RoomPlayer(
            room_id=room.id,
            user_id=user.id,
            seat_position=PlayerPosition(len(room.players) + 1),
        )
        self.session.add(host_player)
        await self.session.flush()
        await self.session.refresh(host_player)
        await self.session.refresh(room, attribute_names=["players", "games"])
        return room, host_player

    async def join_room(self, payload: RoomJoinRequest) -> tuple[Room, RoomPlayer]:
        room = await self.get_room_by_code(payload.room_code)
        if room.status != RoomStatus.WAITING:
            raise ValueError("Room is not accepting new players")
        if len(room.players) >= room.max_players:
            raise ValueError("Room is full")

        user = await self._get_or_create_user(payload.display_name)
        existing_assignment = next((p for p in room.players if p.user_id == user.id), None)
        if existing_assignment:
            return room, existing_assignment

        next_position = self._next_available_position(room.players)
        player = RoomPlayer(
            room_id=room.id,
            user_id=user.id,
            seat_position=PlayerPosition(next_position),
        )
        self.session.add(player)
        await self.session.flush()
        await self.session.refresh(player)

        await self.session.refresh(room, attribute_names=["players", "games"])
        return await self.get_room_by_code(payload.room_code), player

    async def mark_room_active(self, room_id: uuid.UUID) -> None:
        result = await self.session.execute(select(Room).where(Room.id == room_id))
        room = result.scalar_one()
        room.status = RoomStatus.ACTIVE
        await self.session.flush()

    async def _create_unique_room(self, host_user_id: uuid.UUID, total_rounds: int) -> Room:
        for _ in range(10):
            candidate_code = generate_room_code()
            exists = await self.session.execute(select(Room).where(Room.code == candidate_code))
            if exists.scalar_one_or_none():
                continue
            room = Room(code=candidate_code, host_user_id=host_user_id, configured_rounds=total_rounds)
            self.session.add(room)
            await self.session.flush()
            await self.session.refresh(room, attribute_names=["players", "games"])
            return room
        raise RuntimeError("Unable to generate unique room code")

    async def _get_or_create_user(self, display_name: str) -> User:
        result = await self.session.execute(select(User).where(User.display_name == display_name))
        user = result.scalar_one_or_none()
        if user:
            return user
        user = User(display_name=display_name)
        self.session.add(user)
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def get_room_by_code(self, room_code: str) -> Room:
        result = await self.session.execute(
            select(Room)
            .where(Room.code == room_code)
            .options(
                selectinload(Room.players).selectinload(RoomPlayer.user),
                selectinload(Room.games),
            )
        )
        room = result.scalar_one_or_none()
        if room is None:
            raise ValueError("Room not found")
        return room

    def _next_available_position(self, players: Sequence[RoomPlayer]) -> int:
        used_positions = {int(player.seat_position) for player in players}
        for candidate in range(1, 5):
            if candidate not in used_positions:
                return candidate
        raise ValueError("No available seat positions")
