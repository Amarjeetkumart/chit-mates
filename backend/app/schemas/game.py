from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import CardType, GameStatus, RoundStatus
from app.schemas.common import APIModel


class GameStartRequest(BaseModel):
    room_code: str = Field(min_length=4, max_length=12)
    room_player_id: UUID


class PassCardRequest(BaseModel):
    round_id: UUID
    sender_id: UUID
    card_type: CardType


class GamePlayerState(APIModel):
    game_player_id: UUID
    room_player_id: UUID
    display_name: str
    seat_position: int
    is_active: bool
    finish_position: int | None
    score: int
    cards: list[CardType] = Field(default_factory=list)


class RoundPublicState(APIModel):
    round_id: UUID
    game_id: UUID
    status: RoundStatus
    active_player_id: UUID | None
    turn_counter: int
    finish_order: list[UUID]
    winner_cards: dict[UUID, CardType]
    players: list[GamePlayerState]
    draw_players: list[UUID] = Field(default_factory=list)


class GameStateResponse(APIModel):
    game_id: UUID
    room_id: UUID
    status: GameStatus
    current_round: RoundPublicState | None
    total_rounds: int
    current_round_index: int


class PassCardResponse(APIModel):
    draw_players: list[UUID] = Field(default_factory=list)
    state: RoundPublicState
    score_updates: dict[UUID, int]


class NextRoundRequest(BaseModel):
    game_id: UUID
    room_player_id: UUID


class NextRoundResponse(APIModel):
    state: RoundPublicState
    current_round_index: int


class LeaderboardEntryModel(APIModel):
    user_id: UUID
    display_name: str
    total_points: int
    wins: int
    second_places: int
    third_places: int
    losses: int
    games_played: int
    updated_at: datetime


class LeaderboardResponse(APIModel):
    entries: list[LeaderboardEntryModel]
