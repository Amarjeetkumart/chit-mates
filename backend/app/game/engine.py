from __future__ import annotations

import random
from collections import Counter, deque
from typing import Iterable
from uuid import UUID

from pydantic import BaseModel

from app.game.state import PlayerRoundState, RoundState, RoundStateFactory
from app.models import CARD_POINTS, CardType


class DealResult(BaseModel):
    hands: dict[UUID, list[CardType]]
    deck: list[CardType]


class GameEngine:
    def __init__(self, seed: int | None = None) -> None:
        self.random = random.Random(seed)

    def _build_deck(self) -> list[CardType]:
        deck: list[CardType] = []
        for card_type in CardType:
            deck.extend([card_type] * 4)
        self.random.shuffle(deck)
        return deck

    def deal_cards(self, player_ids: Iterable[UUID]) -> DealResult:
        players = list(player_ids)
        if len(players) != 4:
            raise ValueError("Exactly 4 players are required to start the game")
        deck = self._build_deck()
        hands: dict[UUID, list[CardType]] = {player_id: [] for player_id in players}
        while deck:
            for player_id in players:
                if deck:
                    hands[player_id].append(deck.pop())
        return DealResult(hands=hands, deck=[])

    def create_round_state(
        self,
        round_id: UUID,
        game_id: UUID,
        ordered_players: list[tuple[UUID, int]],
    ) -> RoundState:
        deal_result = self.deal_cards([player_id for player_id, _ in ordered_players])
        return RoundStateFactory.create(
            round_id=round_id,
            game_id=game_id,
            players=ordered_players,
            hands=deal_result.hands,
        )

    def validate_pass(
        self,
        state: RoundState,
        sender_id: UUID,
        card_type: CardType,
    ) -> UUID:
        active_player_id = state.get_active_player_id()
        if sender_id != active_player_id:
            raise ValueError("It is not the sender's turn")
        sender_state = state.players[sender_id]
        if card_type not in sender_state.cards:
            raise ValueError("Sender does not possess the selected card")
        receiver_id = state.get_player_after(sender_id)
        last_card = state.last_card_for_pair(sender_id, receiver_id)
        if last_card is not None and last_card == card_type:
            raise ValueError("Cannot pass the same card type consecutively to this player")
        return receiver_id

    def pass_card(
        self,
        state: RoundState,
        sender_id: UUID,
        card_type: CardType,
    ) -> tuple[RoundState, dict[UUID, int], UUID]:
        receiver_id = self.validate_pass(state, sender_id, card_type)
        sender_state = state.players[sender_id]
        receiver_state = state.players[receiver_id]

        sender_state.cards.remove(card_type)
        receiver_state.cards.append(card_type)

        state.record_pass(sender_id, receiver_id, card_type)

        score_updates: dict[UUID, int] = {}

        winner_card = self._detect_four_of_a_kind(receiver_state)
        if winner_card is not None:
            finish_position = len(state.finish_order) + 1
            score_delta = CARD_POINTS[winner_card] * 4
            receiver_state.score += score_delta
            score_updates[receiver_id] = score_delta
            state.winner_cards[receiver_id] = winner_card
            leftover_cards: list[CardType] = []
            removed = 0
            for card in receiver_state.cards:
                if card == winner_card and removed < 4:
                    removed += 1
                    continue
                leftover_cards.append(card)
            receiver_state.cards.clear()
            state.eliminate_player(receiver_id, finish_position)
            if leftover_cards and state.remaining_active_players():
                next_holder_id = state.get_player_after(receiver_id)
                next_holder_state = state.players[next_holder_id]
                next_holder_state.cards.extend(leftover_cards)
                for leftover_card in leftover_cards:
                    state.record_pass(receiver_id, next_holder_id, leftover_card)

        if state.is_round_complete():
            remaining = state.remaining_active_players()
            if remaining:
                loser_id = remaining[0]
                loser_state = state.players[loser_id]
                loser_state.is_active = False
                loser_state.finish_position = len(state.finish_order) + 1
                state.finish_order.append(loser_id)
            state.turn_counter += 1
            return state, score_updates, receiver_id

        if receiver_id in state.finish_order:
            next_active = state.get_player_after(receiver_id)
        else:
            next_active = receiver_id

        state.set_active_player(next_active)
        state.turn_counter += 1
        loop_detected = state.register_snapshot()
        if loop_detected and self._should_declare_draw(state):
            self._finalize_draw(state)
        return state, score_updates, receiver_id

    def _detect_four_of_a_kind(self, player_state: PlayerRoundState) -> CardType | None:
        counter = Counter(player_state.cards)
        for card_type, count in counter.items():
            if count >= 4:
                return card_type
        return None

    def _should_declare_draw(self, state: RoundState) -> bool:
        remaining = state.remaining_active_players()
        return len(remaining) == 2 and not state.draw_players

    def _finalize_draw(self, state: RoundState) -> None:
        remaining = state.remaining_active_players()
        if len(remaining) != 2:
            return
        state.draw_players = list(remaining)
        for player_id in remaining:
            player_state = state.players[player_id]
            player_state.is_active = False
            player_state.finish_position = None
        state.finish_order.extend(remaining)
