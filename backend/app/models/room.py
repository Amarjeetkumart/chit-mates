from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import GameStatus, PlayerPosition, RoomStatus


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(12), unique=True, nullable=False, index=True)
    host_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    status: Mapped[RoomStatus] = mapped_column(Enum(RoomStatus, name="room_status"), default=RoomStatus.WAITING, nullable=False)
    configured_rounds: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    max_players: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    players: Mapped[list["RoomPlayer"]] = relationship(back_populates="room", cascade="all, delete-orphan")
    games: Mapped[list["Game"]] = relationship(back_populates="room", cascade="all, delete-orphan")

    @property
    def active_game_id(self) -> uuid.UUID | None:
        for game in self.games:
            if game.status == GameStatus.IN_PROGRESS:
                return game.id
        for game in self.games:
            if game.status == GameStatus.CREATED:
                return game.id
        return None


class RoomPlayer(Base):
    __tablename__ = "room_players"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    seat_position: Mapped[PlayerPosition] = mapped_column(Enum(PlayerPosition, name="player_position"), nullable=False)
    is_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    room: Mapped[Room] = relationship(back_populates="players")
    user: Mapped["User"] = relationship(back_populates="rooms")
    game_players: Mapped[list["GamePlayer"]] = relationship(back_populates="room_player", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"RoomPlayer(room={self.room_id}, user={self.user_id}, seat={self.seat_position})"
