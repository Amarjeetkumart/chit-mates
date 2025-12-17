from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.game.engine import GameEngine
from app.game.state import RoundState
from app.models import (
    CARD_POINTS,
    Card,
    CardType,
    Game,
    GamePlayer,
    GameStatus,
    LeaderboardEntry,
    Move,
    Room,
    RoomPlayer,
    RoomStatus,
    Round,
    RoundStatus,
)
from app.realtime import trigger_voice_shutdown
from app.schemas.game import (
    GamePlayerState,
    GameStartRequest,
    GameStateResponse,
    NextRoundRequest,
    NextRoundResponse,
    PassCardRequest,
    PassCardResponse,
    RoundPublicState,
)
from app.services.event_bus import broadcast_room_event


class GameService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.engine = GameEngine()

    async def start_game(self, payload: GameStartRequest) -> GameStateResponse:
        room = await self._get_room_by_code(payload.room_code)
        if len(room.players) != 4:
            raise ValueError("Exactly 4 players must join before starting the game")

        self._validate_round_starter(room, payload.room_player_id, round_number=1)

        existing_game = await self._get_active_game(room.id)
        if existing_game:
            return await self.get_game_state(existing_game.id)

        game = Game(
            room_id=room.id,
            total_rounds=room.configured_rounds,
            current_round_index=1,
            status=GameStatus.IN_PROGRESS,
        )
        self.session.add(game)
        await self.session.flush()

        game_players = []
        ordered_players = sorted(room.players, key=lambda rp: int(rp.seat_position))
        for rp in ordered_players:
            gp = GamePlayer(
                game_id=game.id,
                room_player_id=rp.id,
                seat_position=int(rp.seat_position),
                is_active=True,
            )
            self.session.add(gp)
            game_players.append(gp)
        await self.session.flush()

        round_record = Round(
            game_id=game.id,
            round_number=1,
            status=RoundStatus.RUNNING,
            started_at=datetime.utcnow(),
        )
        self.session.add(round_record)
        await self.session.flush()

        ordered_pairs = [(gp.id, gp.seat_position) for gp in game_players]
        starter_game_player = next((gp for gp in game_players if gp.room_player_id == payload.room_player_id), None)
        starter_player_id = starter_game_player.id if starter_game_player else None
        round_state = self.engine.create_round_state(
            round_record.id,
            game.id,
            ordered_pairs,
            starter_player_id=starter_player_id,
        )
        round_record.state_snapshot = round_state.model_dump(mode="json")

        await self._initialize_cards(round_record.id, round_state)

        room.status = RoomStatus.ACTIVE
        await self.session.commit()

        state = await self.get_game_state(game.id)
        await self._broadcast_state(room.code, state)
        return state

    async def pass_card(self, payload: PassCardRequest) -> PassCardResponse:
        round_record = await self._get_round_with_context(payload.round_id)
        if round_record.status != RoundStatus.RUNNING:
            raise ValueError("Round is not active")

        state = RoundState.model_validate(round_record.state_snapshot)
        state, score_updates, receiver_id, auto_transfers = self.engine.pass_card(
            state,
            payload.sender_id,
            payload.card_type,
        )

        await self._update_cards(round_record.id, payload.sender_id, receiver_id, payload.card_type)
        for auto_sender_id, auto_receiver_id, auto_card in auto_transfers:
            await self._update_cards(round_record.id, auto_sender_id, auto_receiver_id, auto_card)
        await self._persist_round_state(round_record, state)
        await self._persist_scores(round_record.game_id, score_updates, state)
        await self._record_move(round_record, payload.sender_id, receiver_id, payload.card_type)
        for auto_sender_id, auto_receiver_id, auto_card in auto_transfers:
            await self._record_move(round_record, auto_sender_id, auto_receiver_id, auto_card)

        if state.is_round_complete():
            await self._finalize_round(round_record, state)

        await self.session.commit()

        refreshed = await self.get_game_state(round_record.game_id)
        if refreshed.current_round is None:
            raise RuntimeError("Game state missing round after pass")
        score_updates_str = {player_id: score for player_id, score in score_updates.items()}
        await self._broadcast_state(round_record.game.room.code, refreshed)
        return PassCardResponse(
            state=refreshed.current_round,
            score_updates=score_updates_str,
            draw_players=refreshed.current_round.draw_players,
        )

    async def get_game_state(self, game_id: UUID) -> GameStateResponse:
        game = await self._get_game_with_context(game_id)
        current_round = next((rnd for rnd in game.rounds if rnd.round_number == game.current_round_index), None)
        round_state_model: RoundPublicState | None = None
        if current_round and current_round.state_snapshot:
            state = RoundState.model_validate(current_round.state_snapshot)
            round_state_model = self._build_round_public_state(game, current_round, state)

        return GameStateResponse(
            game_id=game.id,
            room_id=game.room_id,
            status=game.status,
            current_round=round_state_model,
            total_rounds=game.total_rounds,
            current_round_index=game.current_round_index,
        )

    async def start_next_round(self, payload: NextRoundRequest) -> NextRoundResponse:
        game = await self._get_game_with_context(payload.game_id)
        if game.current_round_index >= game.total_rounds:
            raise ValueError("All rounds have been completed")

        upcoming_round_index = game.current_round_index + 1
        self._validate_round_starter(game.room, payload.room_player_id, round_number=upcoming_round_index)

        game.current_round_index += 1
        for gp in game.players:
            gp.is_active = True
            gp.finish_position = None
        round_record = Round(
            game_id=game.id,
            round_number=game.current_round_index,
            status=RoundStatus.RUNNING,
            started_at=datetime.utcnow(),
        )
        self.session.add(round_record)
        await self.session.flush()

        ordered_pairs = [(gp.id, gp.seat_position) for gp in sorted(game.players, key=lambda gp: gp.seat_position)]
        starter_game_player = next((gp for gp in game.players if gp.room_player_id == payload.room_player_id), None)
        starter_player_id = starter_game_player.id if starter_game_player else None
        round_state = self.engine.create_round_state(
            round_record.id,
            game.id,
            ordered_pairs,
            starter_player_id=starter_player_id,
        )
        round_record.state_snapshot = round_state.model_dump(mode="json")
        await self._initialize_cards(round_record.id, round_state)

        await self.session.commit()

        state = self._build_round_public_state(game, round_record, round_state)
        full_state = await self.get_game_state(game.id)
        await self._broadcast_state(game.room.code, full_state)
        return NextRoundResponse(state=state, current_round_index=game.current_round_index)

    async def _get_room_by_code(self, room_code: str) -> Room:
        result = await self.session.execute(
            select(Room)
            .where(Room.code == room_code)
            .options(
                selectinload(Room.players).selectinload(RoomPlayer.user),
                selectinload(Room.games),
            )
        )
        room = result.scalar_one_or_none()
        if not room:
            raise ValueError("Room not found")
        return room

    async def _get_active_game(self, room_id: UUID) -> Game | None:
        result = await self.session.execute(
            select(Game)
            .where(and_(Game.room_id == room_id, Game.status == GameStatus.IN_PROGRESS))
        )
        return result.scalar_one_or_none()

    async def _get_round_with_context(self, round_id: UUID) -> Round:
        result = await self.session.execute(
            select(Round)
            .where(Round.id == round_id)
            .options(
                selectinload(Round.game)
                .selectinload(Game.players)
                .selectinload(GamePlayer.room_player)
                .selectinload(RoomPlayer.user),
                selectinload(Round.game).selectinload(Game.room),
            )
        )
        round_record = result.scalar_one_or_none()
        if not round_record:
            raise ValueError("Round not found")
        return round_record

    async def _get_game_with_context(self, game_id: UUID) -> Game:
        result = await self.session.execute(
            select(Game)
            .where(Game.id == game_id)
            .options(
                selectinload(Game.room).selectinload(Room.players),
                selectinload(Game.players)
                .selectinload(GamePlayer.room_player)
                .selectinload(RoomPlayer.user),
                selectinload(Game.rounds),
            )
        )
        game = result.scalar_one_or_none()
        if not game:
            raise ValueError("Game not found")
        return game

    async def _initialize_cards(self, round_id: UUID, state: RoundState) -> None:
        position_counter = 0
        for owner_id, player_state in state.players.items():
            for card in player_state.cards:
                record = Card(
                    round_id=round_id,
                    owner_id=owner_id,
                    card_type=card,
                    position_index=position_counter,
                )
                self.session.add(record)
                position_counter += 1
        await self.session.flush()

    async def _update_cards(self, round_id: UUID, sender_id: UUID, receiver_id: UUID, card_type: CardType) -> None:
        card_result = await self.session.execute(
            select(Card)
            .where(
                and_(
                    Card.round_id == round_id,
                    Card.owner_id == sender_id,
                    Card.card_type == card_type,
                )
            )
            .order_by(Card.position_index)
            .limit(1)
        )
        card = card_result.scalar_one_or_none()
        if not card:
            raise ValueError("Card state is out of sync")
        card.owner_id = receiver_id
        await self.session.flush()

    async def _persist_round_state(self, round_record: Round, state: RoundState) -> None:
        round_record.state_snapshot = state.model_dump(mode="json")
        await self.session.flush()

    async def _persist_scores(self, game_id: UUID, score_updates: dict[UUID, int], state: RoundState) -> None:
        if not score_updates:
            return
        result = await self.session.execute(select(GamePlayer).where(GamePlayer.id.in_(score_updates.keys())))
        players = {gp.id: gp for gp in result.scalars().all()}
        for player_id, delta in score_updates.items():
            player = players.get(player_id)
            if not player:
                continue
            player.score += delta
        await self.session.flush()

    async def _record_move(
        self,
        round_record: Round,
        sender_id: UUID,
        receiver_id: UUID,
        card_type: CardType,
    ) -> None:
        state = RoundState.model_validate(round_record.state_snapshot)
        move = Move(
            round_id=round_record.id,
            sender_id=sender_id,
            receiver_id=receiver_id,
            card_type=card_type,
            turn_order=state.turn_counter,
        )
        self.session.add(move)
        await self.session.flush()

    async def _finalize_round(self, round_record: Round, state: RoundState) -> None:
        round_record.status = RoundStatus.FINISHED
        round_record.finished_at = datetime.utcnow()
        await self._synchronize_game_players(round_record.game_id, state)
        await self._update_leaderboard(round_record.game, state)
        await self._maybe_complete_game(round_record.game)
        await self.session.flush()

    async def _synchronize_game_players(self, game_id: UUID, state: RoundState) -> None:
        result = await self.session.execute(select(GamePlayer).where(GamePlayer.game_id == game_id))
        players = {gp.id: gp for gp in result.scalars().all()}
        for player_id, player_state in state.players.items():
            player = players.get(player_id)
            if not player:
                continue
            player.is_active = player_state.is_active
            player.finish_position = player_state.finish_position

    async def _update_leaderboard(self, game: Game, state: RoundState) -> None:
        players = {gp.id: gp for gp in game.players}
        draw_ids = set(state.draw_players)
        for idx, player_id in enumerate(state.finish_order, start=1):
            player = players.get(player_id)
            if not player:
                continue
            room_player = player.room_player
            user = room_player.user
            entry = await self._get_leaderboard_entry(user.id)
            entry.games_played += 1
            if player_id in draw_ids:
                entry.losses += 1
                entry.updated_at = datetime.utcnow()
                continue
            if idx == 1:
                entry.wins += 1
                card_type = state.winner_cards.get(player_id)
                if card_type:
                    entry.total_points += CARD_POINTS[card_type] * 4
            elif idx == 2:
                entry.second_places += 1
                card_type = state.winner_cards.get(player_id)
                if card_type:
                    entry.total_points += CARD_POINTS[card_type] * 4
            elif idx == 3:
                entry.third_places += 1
                card_type = state.winner_cards.get(player_id)
                if card_type:
                    entry.total_points += CARD_POINTS[card_type] * 4
            else:
                entry.losses += 1
            entry.updated_at = datetime.utcnow()

    async def _maybe_complete_game(self, game: Game) -> None:
        if game.current_round_index >= game.total_rounds:
            game.status = GameStatus.COMPLETED
            if game.room:
                game.room.status = RoomStatus.COMPLETED
                await trigger_voice_shutdown(game.room.code, reason="match_complete")
        else:
            game.status = GameStatus.IN_PROGRESS

    async def _get_leaderboard_entry(self, user_id: UUID) -> LeaderboardEntry:
        result = await self.session.execute(select(LeaderboardEntry).where(LeaderboardEntry.user_id == user_id))
        entry = result.scalar_one_or_none()
        if entry:
            return entry
        entry = LeaderboardEntry(user_id=user_id)
        self.session.add(entry)
        await self.session.flush()
        return entry

    def _build_round_public_state(self, game: Game, round_record: Round, state: RoundState) -> RoundPublicState:
        players_lookup = {gp.id: gp for gp in game.players}
        active_player_id = None
        if state.remaining_active_players():
            active_player_id = state.get_active_player_id()

        players_view = []
        for player_id, player_state in state.players.items():
            player_model = players_lookup[player_id]
            room_player = player_model.room_player
            players_view.append(
                GamePlayerState(
                    game_player_id=player_id,
                    room_player_id=room_player.id,
                    display_name=room_player.user.display_name,
                    seat_position=player_model.seat_position,
                    is_active=player_state.is_active,
                    finish_position=player_state.finish_position,
                    score=player_model.score,
                    cards=list(player_state.cards),
                )
            )

        return RoundPublicState(
            round_id=round_record.id,
            game_id=game.id,
            status=round_record.status,
            active_player_id=active_player_id,
            turn_counter=state.turn_counter,
            finish_order=list(state.finish_order),
            winner_cards=dict(state.winner_cards),
            players=sorted(players_view, key=lambda gp: gp.seat_position),
            draw_players=list(state.draw_players),
        )

    def _validate_round_starter(self, room: Room, room_player_id: UUID, round_number: int) -> None:
        initiator = next((player for player in room.players if player.id == room_player_id), None)
        if initiator is None:
            raise ValueError("Player is not part of this room")
        player_count = len(room.players)
        if player_count == 0:
            raise ValueError("Room has no players")
        expected_position = ((round_number - 1) % player_count) + 1
        if int(initiator.seat_position) != expected_position:
            raise ValueError("Player is not authorized to start this round")

    async def _broadcast_state(self, room_code: str, state: GameStateResponse) -> None:
        await broadcast_room_event(
            room_code,
            {
                "type": "game_state",
                "payload": state.model_dump(mode="json"),
            },
        )
