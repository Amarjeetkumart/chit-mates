from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import PlayerPosition, RoomStatus
from app.schemas.common import APIModel
from app.schemas.user import UserRead


class RoomCreateRequest(BaseModel):
    host_display_name: str = Field(min_length=1, max_length=64)
    total_rounds: int = Field(default=1, ge=1, le=50)


class RoomJoinRequest(BaseModel):
    room_code: str = Field(min_length=4, max_length=12)
    display_name: str = Field(min_length=1, max_length=64)


class RoomPlayerRead(APIModel):
    id: UUID
    seat_position: PlayerPosition
    is_ready: bool
    is_active: bool
    joined_at: datetime
    user: UserRead


class RoomRead(APIModel):
    id: UUID
    code: str
    status: RoomStatus
    created_at: datetime
    updated_at: datetime
    host_user_id: UUID
    max_players: int
    configured_rounds: int
    players: list[RoomPlayerRead]
    active_game_id: UUID | None = Field(default=None)


class RoomCreateResponse(APIModel):
    room: RoomRead
    host: RoomPlayerRead
    total_rounds: int


class RoomJoinResponse(APIModel):
    room: RoomRead
    player: RoomPlayerRead
