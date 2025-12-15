import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchRoom } from "../api/rooms";
import { fetchGameState, startGame } from "../api/game";
import { connectToRoomSocket } from "../services/websocket";
import { useGameStore } from "../store/useGameStore";
import type { GameStateResponse } from "../types/api";

export function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const room = useGameStore((state) => state.room);
  const player = useGameStore((state) => state.player);
  const setRoom = useGameStore((state) => state.setRoom);
  const setGameState = useGameStore((state) => state.setGameState);
  const setGamePlayerId = useGameStore((state) => state.setGamePlayerId);
  const setSocketConnected = useGameStore((state) => state.setSocketConnected);
  const currentGameId = useGameStore((state) => state.game?.game_id ?? null);
  const currentGame = useGameStore((state) => state.game);
  const playerId = player?.id ?? null;

  const { data: latestRoom } = useQuery({
    queryKey: ["room", roomCode],
    queryFn: () => fetchRoom(roomCode ?? ""),
    enabled: Boolean(roomCode),
    refetchInterval: 5000,
  });

  const resolvedRoom = latestRoom ?? room;
  const sortedPlayers = useMemo(
    () => (resolvedRoom ? [...resolvedRoom.players].sort((a, b) => a.seat_position - b.seat_position) : []),
    [resolvedRoom],
  );
  const playerCount = resolvedRoom?.players.length ?? 0;
  const nextStarterSeat = sortedPlayers.length ? ((currentGame?.current_round_index ?? 0) % sortedPlayers.length) + 1 : null;
  const nextStarter = nextStarterSeat ? sortedPlayers.find((roomPlayer) => roomPlayer.seat_position === nextStarterSeat) : undefined;
  const isNextStarter = player?.seat_position === nextStarterSeat;
  const canStart = Boolean(resolvedRoom && player && playerCount === 4 && resolvedRoom.status === "waiting" && isNextStarter);

  useEffect(() => {
    if (latestRoom) {
      setRoom(latestRoom);
    }
  }, [latestRoom, setRoom]);

  useEffect(() => {
    if (!resolvedRoom?.active_game_id) {
      return;
    }
    if (!playerId) {
      return;
    }
    const gameId = resolvedRoom.active_game_id;
    if (!gameId) {
      return;
    }
    if (currentGameId === gameId) {
      navigate(`/game/${gameId}`);
      return;
    }

    let cancelled = false;
    fetchGameState(gameId)
      .then((gameState) => {
        if (cancelled) {
          return;
        }
        setGameState(gameState);
        setGamePlayerId(resolveGamePlayerId(gameState, playerId));
        navigate(`/game/${gameId}`);
      })
      .catch((error: Error) => {
        console.error("Failed to load active game state", error);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedRoom?.active_game_id, currentGameId, playerId, navigate, setGameState, setGamePlayerId]);

  useEffect(() => {
    if (!roomCode) {
      return;
    }
    const disconnect = connectToRoomSocket(
      roomCode,
      (event) => {
        if (event.type === "room_state") {
          setRoom(event.payload);
        }
        if (event.type === "game_state") {
          setGameState(event.payload);
          setGamePlayerId(resolveGamePlayerId(event.payload, playerId));
          navigate(`/game/${event.payload.game_id}`);
        }
      },
      (connected) => setSocketConnected(connected),
    );
    return () => disconnect();
  }, [roomCode, setRoom, setGameState, setGamePlayerId, playerId, navigate, setSocketConnected]);

  const startGameMutation = useMutation({
    mutationFn: startGame,
    onSuccess: (gameState) => {
      setGameState(gameState);
      setGamePlayerId(resolveGamePlayerId(gameState, playerId));
      navigate(`/game/${gameState.game_id}`);
    },
  });

  return (
    <div className="page">
      <header className="page__header">
        <h1>Lobby</h1>
        {resolvedRoom ? (
          <p>
            Room Code: <strong>{resolvedRoom.code}</strong> · Rounds: {resolvedRoom.configured_rounds}
          </p>
        ) : (
          <p>Loading room details...</p>
        )}
      </header>

      <section className="panel">
        <h2>Players ({playerCount}/4)</h2>
        <ul className="list">
          {resolvedRoom?.players.length ? (
            resolvedRoom.players.map((roomPlayer) => (
              <li key={roomPlayer.id} className="list__item">
                <span className="badge">Seat {roomPlayer.seat_position}</span>
                <span className="list__item-name">{roomPlayer.user.display_name}</span>
                {resolvedRoom.host_user_id === roomPlayer.user.id ? <span className="tag">Host</span> : null}
              </li>
            ))
          ) : (
            <li>No players yet</li>
          )}
        </ul>
      </section>

      {canStart ? (
        <button
          className="button button--primary"
          onClick={() => {
            if (!resolvedRoom || !player) {
              return;
            }
            startGameMutation.mutate({ room_code: resolvedRoom.code, room_player_id: player.id });
          }}
          disabled={!canStart || startGameMutation.isPending}
        >
          {startGameMutation.isPending ? "Starting..." : "Start Game"}
        </button>
      ) : (
        <p>
          {playerCount < 4
            ? "Waiting for additional players to join..."
            : nextStarter
              ? `Waiting for ${nextStarter.user.display_name} to start the game...`
              : "Waiting for the designated starter..."}
        </p>
      )}
    </div>
  );
}

function resolveGamePlayerId(gameState: GameStateResponse, roomPlayerId: string | undefined | null): string | null {
  if (!roomPlayerId || !gameState.current_round) {
    return null;
  }
  const match = gameState.current_round.players.find((player) => player.room_player_id === roomPlayerId);
  return match?.game_player_id ?? null;
}
