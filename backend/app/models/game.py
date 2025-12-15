from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import CardType, GameStatus, RoundStatus


class Game(Base):
    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    total_rounds: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_round_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[GameStatus] = mapped_column(Enum(GameStatus, name="game_status"), default=GameStatus.CREATED, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    room: Mapped["Room"] = relationship(back_populates="games")
    rounds: Mapped[list["Round"]] = relationship(back_populates="game", cascade="all, delete-orphan")
    players: Mapped[list["GamePlayer"]] = relationship(back_populates="game", cascade="all, delete-orphan")


class GamePlayer(Base):
    __tablename__ = "game_players"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), index=True)
    room_player_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("room_players.id", ondelete="CASCADE"))
    seat_position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    finish_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score: Mapped[int] = mapped_column(Integer, default=0)

    game: Mapped[Game] = relationship(back_populates="players")
    room_player: Mapped["RoomPlayer"] = relationship(back_populates="game_players")
    moves: Mapped[list["Move"]] = relationship(back_populates="sender", foreign_keys="Move.sender_id")
    received_moves: Mapped[list["Move"]] = relationship(back_populates="receiver", foreign_keys="Move.receiver_id")


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    game_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("games.id", ondelete="CASCADE"), index=True)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    state_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[RoundStatus] = mapped_column(Enum(RoundStatus, name="round_status"), default=RoundStatus.WAITING, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    game: Mapped[Game] = relationship(back_populates="rounds")
    moves: Mapped[list["Move"]] = relationship(back_populates="round", cascade="all, delete-orphan")
    cards: Mapped[list["Card"]] = relationship(back_populates="round", cascade="all, delete-orphan")


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rounds.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("game_players.id", ondelete="SET NULL"), nullable=True)
    card_type: Mapped[CardType] = mapped_column(Enum(CardType, name="card_type"), nullable=False)
    position_index: Mapped[int] = mapped_column(Integer, nullable=False)

    round: Mapped[Round] = relationship(back_populates="cards")
    owner: Mapped["GamePlayer"] = relationship()


class Move(Base):
    __tablename__ = "moves"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    round_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rounds.id", ondelete="CASCADE"), index=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game_players.id", ondelete="CASCADE"), index=True)
    receiver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game_players.id", ondelete="CASCADE"), index=True)
    card_type: Mapped[CardType] = mapped_column(Enum(CardType, name="card_type_move"), nullable=False)
    turn_order: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    round: Mapped[Round] = relationship(back_populates="moves")
    sender: Mapped[GamePlayer] = relationship(back_populates="moves", foreign_keys=[sender_id])
    receiver: Mapped[GamePlayer] = relationship(back_populates="received_moves", foreign_keys=[receiver_id])


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    total_points: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    second_places: Mapped[int] = mapped_column(Integer, default=0)
    third_places: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="leaderboard_entry")
