import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { fetchGameState, passCard, startNextRound } from "../api/game";
import { connectToRoomSocket } from "../services/websocket";
import { useGameStore } from "../store/useGameStore";
import type { CardType, GamePlayerState, GameStateResponse } from "../types/api";

const CARD_LABEL: Record<CardType, string> = {
  heart: "Heart",
  diamond: "Diamond",
  tree: "Tree",
  black_jack: "Black Jack",
};

export function GameBoardPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  const room = useGameStore((state) => state.room);
  const player = useGameStore((state) => state.player);
  const game = useGameStore((state) => state.game);
  const gamePlayerId = useGameStore((state) => state.gamePlayerId);
  const setGameState = useGameStore((state) => state.setGameState);
  const setGamePlayerId = useGameStore((state) => state.setGamePlayerId);
  const setSocketConnected = useGameStore((state) => state.setSocketConnected);
  const sortedRoomPlayers = useMemo(
    () => (room ? [...room.players].sort((a, b) => a.seat_position - b.seat_position) : []),
    [room],
  );

  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const playerRoomId = player?.id ?? null;
  const playerSeat = player?.seat_position ?? null;

  useEffect(() => {
    if (!lastMessage) {
      return;
    }
    const timer = window.setTimeout(() => setLastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [lastMessage]);

  const { data: latestState } = useQuery({
    queryKey: ["game", gameId],
    queryFn: () => fetchGameState(gameId ?? ""),
    enabled: Boolean(gameId),
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!latestState) {
      return;
    }
    setGameState(latestState);
    if (!gamePlayerId) {
      setGamePlayerId(resolveGamePlayerId(latestState, playerRoomId));
    }
  }, [latestState, setGameState, setGamePlayerId, gamePlayerId, playerRoomId]);

  useEffect(() => {
    if (!room?.code) {
      return;
    }
    const disconnect = connectToRoomSocket(
      room.code,
      (event) => {
        if (event.type === "game_state") {
          setGameState(event.payload);
          setGamePlayerId(resolveGamePlayerId(event.payload, playerRoomId));
        }
      },
      (connected) => setSocketConnected(connected),
    );
    return () => disconnect();
  }, [room?.code, playerRoomId, setGameState, setGamePlayerId, setSocketConnected]);

  useEffect(() => {
    if (!room?.code) {
      navigate("/");
    }
  }, [room?.code, navigate]);

  const activeRound = game?.current_round ?? null;
  const myState = useMemo(() => resolvePlayerState(game, gamePlayerId), [game, gamePlayerId]);
  const isMyTurn = activeRound?.active_player_id === gamePlayerId && myState?.is_active;
  const drawPlayers = activeRound?.draw_players ?? [];
  const nextStarterSeat = sortedRoomPlayers.length
    ? ((game?.current_round_index ?? 0) % sortedRoomPlayers.length) + 1
    : null;
  const nextStarter = nextStarterSeat
    ? sortedRoomPlayers.find((roomPlayer) => roomPlayer.seat_position === nextStarterSeat)
    : undefined;
  const isNextRoundStarter = playerSeat === nextStarterSeat;

  const passCardMutation = useMutation({
    mutationFn: passCard,
    onSuccess: (response) => {
      const current = useGameStore.getState().game;
      if (current) {
        setGameState({ ...current, current_round: response.state });
      }
      setLastMessage("Card passed successfully");
    },
    onError: (error: Error) => {
      setLastMessage(error.message);
    },
  });

  const nextRoundMutation = useMutation({
    mutationFn: startNextRound,
    onSuccess: (data) => {
      const current = useGameStore.getState().game;
      if (current) {
        setGameState({ ...current, current_round: data.state, current_round_index: data.current_round_index });
      } else if (gameId && room) {
        const fallback: GameStateResponse = {
          game_id: gameId,
          room_id: room.id,
          status: "in_progress",
          current_round: data.state,
          total_rounds: room.configured_rounds,
          current_round_index: data.current_round_index,
        };
        setGameState(fallback);
      }
      setLastMessage("Next round started");
    },
    onError: (error: Error) => setLastMessage(error.message),
  });

  const handlePassCard = (card: CardType) => {
    if (!activeRound || !gamePlayerId) {
      return;
    }
    passCardMutation.mutate({
      round_id: activeRound.round_id,
      sender_id: gamePlayerId,
      card_type: card,
    });
  };

  const handleStartNextRound = () => {
    if (!gameId || !playerRoomId) {
      return;
    }
    nextRoundMutation.mutate({ game_id: gameId, room_player_id: playerRoomId });
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>Game Board</h1>
        {room ? <p>Room {room.code}</p> : null}
        {lastMessage ? <p className="info">{lastMessage}</p> : null}
      </header>

      <section className="panel panel--wide">
        <h2>Players</h2>
        <div className="players">
          {activeRound?.players.map((playerState) => (
            <PlayerCard
              key={playerState.game_player_id}
              player={playerState}
              isMe={playerState.game_player_id === gamePlayerId}
              isActive={playerState.game_player_id === activeRound.active_player_id}
              isDraw={drawPlayers.includes(playerState.game_player_id)}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Your Hand</h2>
        <div className="hand">
          {myState?.cards.length ? (
            myState.cards.map((card, index) => (
              <button
                key={`${card}-${index}`}
                className="card"
                disabled={!isMyTurn || passCardMutation.isPending}
                onClick={() => handlePassCard(card)}
              >
                <span>{CARD_LABEL[card]}</span>
              </button>
            ))
          ) : (
            <p>No cards in hand</p>
          )}
        </div>
        <p>{isMyTurn ? "It's your turn! Choose a card to pass." : "Waiting for other players..."}</p>
      </section>

      <section className="panel">
        <h2>Round Progress</h2>
        <p>Turn #{activeRound?.turn_counter ?? 0}</p>
        <ol>
          {activeRound?.finish_order.map((playerId, index) => {
            const playerState = activeRound.players.find((p) => p.game_player_id === playerId);
            if (!playerState) {
              return null;
            }
            const isDraw = drawPlayers.includes(playerId);
            return (
              <li key={playerId}>
                {isDraw ? `Draw - ${playerState.display_name}` : `${index + 1}. ${playerState.display_name}`}
              </li>
            );
          })}
        </ol>
        {activeRound?.status === "finished" && game && game.current_round_index < game.total_rounds && isNextRoundStarter ? (
          <button className="button" onClick={handleStartNextRound} disabled={nextRoundMutation.isPending}>
            {nextRoundMutation.isPending ? "Starting next round..." : "Start Next Round"}
          </button>
        ) : null}
        {activeRound?.status === "finished" && game && game.current_round_index < game.total_rounds && !isNextRoundStarter && nextStarter ? (
          <p>Waiting for {nextStarter.user.display_name} to start the next round...</p>
        ) : null}
      </section>
    </div>
  );
}

function resolvePlayerState(game: GameStateResponse | null, gamePlayerId: string | null): GamePlayerState | null {
  if (!game?.current_round || !gamePlayerId) {
    return null;
  }
  return game.current_round.players.find((player) => player.game_player_id === gamePlayerId) ?? null;
}

function resolveGamePlayerId(gameState: GameStateResponse, roomPlayerId: string | undefined | null): string | null {
  if (!roomPlayerId || !gameState.current_round) {
    return null;
  }
  const match = gameState.current_round.players.find((player) => player.room_player_id === roomPlayerId);
  return match?.game_player_id ?? null;
}

interface PlayerCardProps {
  player: GamePlayerState;
  isMe: boolean;
  isActive: boolean;
  isDraw: boolean;
}

function PlayerCard({ player, isMe, isActive, isDraw }: PlayerCardProps) {
  return (
    <div className={clsx("player-card", { "player-card--me": isMe, "player-card--active": isActive })}>
      <div className="player-card__header">
        <h3>{player.display_name}</h3>
        {isMe ? <span className="tag">You</span> : null}
      </div>
      <p>Seat {player.seat_position}</p>
      <p>Score: {player.score}</p>
      <p>Cards: {player.cards.length}</p>
      {isDraw ? <p>Draw</p> : player.finish_position ? <p>Finished #{player.finish_position}</p> : null}
    </div>
  );
}
