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
        starter_player_id: UUID | None = None,
    ) -> RoundState:
        deal_result = self.deal_cards([player_id for player_id, _ in ordered_players])
        return RoundStateFactory.create(
            round_id=round_id,
            game_id=game_id,
            players=ordered_players,
            hands=deal_result.hands,
            starter_player_id=starter_player_id,
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
    ) -> tuple[RoundState, dict[UUID, int], UUID, list[tuple[UUID, UUID, CardType]]]:
        receiver_id = self.validate_pass(state, sender_id, card_type)
        sender_state = state.players[sender_id]
        receiver_state = state.players[receiver_id]

        sender_state.cards.remove(card_type)
        receiver_state.cards.append(card_type)

        state.record_pass(sender_id, receiver_id, card_type)

        score_updates: dict[UUID, int] = {}
        auto_transfers: list[tuple[UUID, UUID, CardType]] = []

        # Resolve immediate chain wins that can cascade from the received card
        winners_queue: deque[UUID] = deque([receiver_id])
        processed: set[UUID] = set()
        last_winner_id: UUID | None = None

        while winners_queue:
            candidate_id = winners_queue.popleft()
            if candidate_id in processed:
                continue
            processed.add(candidate_id)

            candidate_state = state.players[candidate_id]
            if not candidate_state.is_active:
                continue

            winner_card = self._detect_four_of_a_kind(candidate_state)
            if winner_card is None:
                continue

            next_candidate_id = self._finalize_winner(state, candidate_id, winner_card, score_updates, auto_transfers)
            last_winner_id = candidate_id

            if next_candidate_id is not None and state.players[next_candidate_id].is_active:
                winners_queue.append(next_candidate_id)

        if state.is_round_complete():
            remaining = state.remaining_active_players()
            if remaining:
                loser_id = remaining[0]
                loser_state = state.players[loser_id]
                loser_state.is_active = False
                loser_state.finish_position = len(state.finish_order) + 1
                state.finish_order.append(loser_id)
            state.turn_counter += 1
            return state, score_updates, receiver_id, auto_transfers

        if last_winner_id is not None:
            next_active = state.get_player_after(last_winner_id)
        elif receiver_id in state.finish_order:
            next_active = state.get_player_after(receiver_id)
        else:
            next_active = receiver_id

        state.set_active_player(next_active)
        state.turn_counter += 1
        loop_detected = state.register_snapshot()
        if loop_detected and self._should_declare_draw(state):
            self._finalize_draw(state)
        return state, score_updates, receiver_id, auto_transfers

    def _finalize_winner(
        self,
        state: RoundState,
        winner_id: UUID,
        winner_card: CardType,
        score_updates: dict[UUID, int],
        auto_transfers: list[tuple[UUID, UUID, CardType]],
    ) -> UUID | None:
        winner_state = state.players[winner_id]

        finish_position = len(state.finish_order) + 1
        score_delta = CARD_POINTS[winner_card] * 4
        winner_state.score += score_delta
        score_updates[winner_id] = score_updates.get(winner_id, 0) + score_delta
        state.winner_cards[winner_id] = winner_card

        active_players = state.remaining_active_players()
        next_receiver_id: UUID | None = None

        # Forced pass: winner must hand off one card before exiting the round
        if len(active_players) > 1:
            next_receiver_id = state.get_player_after(winner_id)
            receiver_state = state.players[next_receiver_id]
            winner_state.cards.remove(winner_card)
            receiver_state.cards.append(winner_card)
            state.record_pass(winner_id, next_receiver_id, winner_card)
            auto_transfers.append((winner_id, next_receiver_id, winner_card))
        else:
            winner_state.cards.remove(winner_card)

        removed = 0
        while winner_card in winner_state.cards and removed < 3:
            winner_state.cards.remove(winner_card)
            removed += 1

        leftover_cards = list(winner_state.cards)
        winner_state.cards.clear()

        state.eliminate_player(winner_id, finish_position)

        if leftover_cards:
            if next_receiver_id is None and state.remaining_active_players():
                next_receiver_id = state.get_player_after(winner_id)
            if next_receiver_id is not None:
                receiver_state = state.players[next_receiver_id]
                receiver_state.cards.extend(leftover_cards)
                for leftover_card in leftover_cards:
                    state.record_pass(winner_id, next_receiver_id, leftover_card)
                    auto_transfers.append((winner_id, next_receiver_id, leftover_card))

        return next_receiver_id

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
