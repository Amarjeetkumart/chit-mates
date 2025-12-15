from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field

from app.models import CardType


class PlayerRoundState(BaseModel):
    player_id: UUID
    seat_position: int
    cards: list[CardType] = Field(default_factory=list)
    is_active: bool = True
    finish_position: int | None = None
    score: int = 0


class RoundState(BaseModel):
    round_id: UUID
    game_id: UUID
    turn_order: list[UUID]
    active_player_index: int = 0
    players: dict[UUID, PlayerRoundState]
    finish_order: list[UUID] = Field(default_factory=list)
    winner_cards: dict[UUID, CardType] = Field(default_factory=dict)
    last_card_per_pair: dict[str, CardType] = Field(default_factory=dict)
    turn_counter: int = 0
    state_signatures: set[str] = Field(default_factory=set)
    draw_players: list[UUID] = Field(default_factory=list)

    def get_active_player_id(self) -> UUID:
        return self.turn_order[self.active_player_index]

    def get_player_after(self, player_id: UUID) -> UUID:
        order = self.turn_order
        idx = order.index(player_id)
        while True:
            idx = (idx + 1) % len(order)
            candidate = order[idx]
            player_state = self.players[candidate]
            if player_state.is_active:
                return candidate
        raise RuntimeError("No active players found")

    def advance_turn(self) -> None:
        for _ in range(len(self.turn_order)):
            self.active_player_index = (self.active_player_index + 1) % len(self.turn_order)
            candidate = self.turn_order[self.active_player_index]
            if self.players[candidate].is_active:
                break
        self.turn_counter += 1

    def record_pass(self, sender_id: UUID, receiver_id: UUID, card_type: CardType) -> None:
        key = f"{sender_id}:{receiver_id}"
        self.last_card_per_pair[key] = card_type

    def last_card_for_pair(self, sender_id: UUID, receiver_id: UUID) -> CardType | None:
        key = f"{sender_id}:{receiver_id}"
        return self.last_card_per_pair.get(key)

    def eliminate_player(self, player_id: UUID, finish_position: int) -> None:
        player_state = self.players[player_id]
        player_state.is_active = False
        player_state.finish_position = finish_position
        self.finish_order.append(player_id)

    def remaining_active_players(self) -> list[UUID]:
        return [pid for pid, state in self.players.items() if state.is_active]

    def is_round_complete(self) -> bool:
        return len(self.remaining_active_players()) <= 1

    def set_active_player(self, player_id: UUID) -> None:
        if player_id not in self.turn_order:
            raise ValueError("Player is not part of this round")
        self.active_player_index = self.turn_order.index(player_id)

    def snapshot_signature(self) -> str:
        active_id = self.get_active_player_id() if self.remaining_active_players() else None
        parts = [str(active_id) if active_id else "none"]
        ordered = sorted(self.players.values(), key=lambda state: state.seat_position)
        for player_state in ordered:
            card_tokens = ",".join(sorted(card.value for card in player_state.cards))
            parts.append(f"{player_state.player_id}:{card_tokens}")
        return "|".join(parts)

    def register_snapshot(self) -> bool:
        signature = self.snapshot_signature()
        already_seen = signature in self.state_signatures
        self.state_signatures.add(signature)
        return already_seen


class RoundStateFactory:
    @staticmethod
    def create(
        round_id: UUID,
        game_id: UUID,
        players: list[tuple[UUID, int]],
        hands: dict[UUID, list[CardType]],
    ) -> RoundState:
        turn_order = [player_id for player_id, _ in sorted(players, key=lambda item: item[1])]
        player_states = {
            player_id: PlayerRoundState(player_id=player_id, seat_position=seat, cards=list(hands[player_id]))
            for player_id, seat in sorted(players, key=lambda item: item[1])
        }
        state = RoundState(
            round_id=round_id,
            game_id=game_id,
            turn_order=turn_order,
            active_player_index=0,
            players=player_states,
        )
        state.register_snapshot()
        return state
