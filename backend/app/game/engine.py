from __future__ import annotations

import random
from collections import Counter
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

        chain_last_winner: UUID | None = None
        winner_card = self._detect_four_of_a_kind(receiver_state)
        if winner_card is not None:
            chain_last_winner = self._process_chain_wins(
                state=state,
                initial_winner_id=receiver_id,
                initial_winner_card=winner_card,
                score_updates=score_updates,
                auto_transfers=auto_transfers,
            )

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

        if chain_last_winner is not None:
            next_active = None
            remaining_players = state.remaining_active_players()
            if remaining_players:
                next_active = self._find_next_active_player(state, chain_last_winner)
                if next_active is None and remaining_players:
                    next_active = remaining_players[0]
            else:
                next_active = state.get_active_player_id()
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

    def _find_next_active_player(self, state: RoundState, origin_player_id: UUID) -> UUID | None:
        order = state.turn_order
        if origin_player_id not in order:
            return None
        if len(order) <= 1:
            return None
        idx = order.index(origin_player_id)
        for _ in range(len(order) - 1):
            idx = (idx + 1) % len(order)
            candidate = order[idx]
            candidate_state = state.players[candidate]
            if candidate_state.is_active and candidate != origin_player_id:
                return candidate
        return None

    def _select_forward_card(self, cards: list[CardType], winner_card: CardType) -> CardType | None:
        for card in cards:
            if card != winner_card:
                return card
        return cards[0] if cards else None

    def _process_chain_wins(
        self,
        state: RoundState,
        initial_winner_id: UUID,
        initial_winner_card: CardType,
        score_updates: dict[UUID, int],
        auto_transfers: list[tuple[UUID, UUID, CardType]],
    ) -> UUID | None:
        pending_winner_id: UUID | None = initial_winner_id
        pending_winner_card: CardType | None = initial_winner_card
        last_winner_id: UUID | None = None

        # Process sequential winners triggered by the chain rule.
        while pending_winner_id is not None and pending_winner_card is not None:
            winner_state = state.players[pending_winner_id]

            score_delta = CARD_POINTS[pending_winner_card] * 4
            winner_state.score += score_delta
            score_updates[pending_winner_id] = score_updates.get(pending_winner_id, 0) + score_delta
            state.winner_cards[pending_winner_id] = pending_winner_card

            next_receiver_id = self._find_next_active_player(state, pending_winner_id)
            forwarded_card: CardType | None = None
            cards_snapshot = list(winner_state.cards)
            if cards_snapshot and next_receiver_id is not None:
                # Forward exactly one card before the winner exits the round.
                forwarded_card = self._select_forward_card(cards_snapshot, pending_winner_card)
                if forwarded_card is not None:
                    cards_snapshot.remove(forwarded_card)
                    receiver_state = state.players[next_receiver_id]
                    receiver_state.cards.append(forwarded_card)
                    state.record_pass(pending_winner_id, next_receiver_id, forwarded_card)
                    auto_transfers.append((pending_winner_id, next_receiver_id, forwarded_card))

            winner_state.cards.clear()
            finish_position = len(state.finish_order) + 1
            state.eliminate_player(pending_winner_id, finish_position)
            last_winner_id = pending_winner_id

            if forwarded_card is not None and next_receiver_id is not None:
                next_receiver_state = state.players[next_receiver_id]
                next_winner_card = self._detect_four_of_a_kind(next_receiver_state)
                if next_winner_card is not None:
                    pending_winner_id = next_receiver_id
                    pending_winner_card = next_winner_card
                    continue

            pending_winner_id = None
            pending_winner_card = None

        return last_winner_id