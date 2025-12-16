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
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-white">Lobby</h1>
        {resolvedRoom ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 font-semibold text-sky-300">
              <span className="text-xs uppercase tracking-[0.18em] text-sky-200">Room</span>
              <span className="text-lg text-white">{resolvedRoom.code}</span>
            </span>
            <span className="rounded-full border border-white/10 px-4 py-2 text-slate-200">
              Rounds: {resolvedRoom.configured_rounds}
            </span>
            <span className="rounded-full border border-white/10 px-4 py-2 text-slate-200">
              Players: {playerCount}/4
            </span>
          </div>
        ) : (
          <p className="text-slate-400">Loading room details...</p>
        )}
      </header>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-card backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-white">Players</h2>
          <span className="text-sm text-slate-300">Seats fill clockwise · host starts round one</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {resolvedRoom?.players.length ? (
            resolvedRoom.players.map((roomPlayer) => {
              const isMe = roomPlayer.id === playerId;
              const isHost = resolvedRoom.host_user_id === roomPlayer.user.id;
              return (
                <div
                  key={roomPlayer.id}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-inner transition hover:border-sky-400/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Seat {roomPlayer.seat_position}</p>
                      <p className="text-lg font-semibold text-white">{roomPlayer.user.display_name}</p>
                    </div>
                    <div className="flex gap-2">
                      {isHost ? (
                        <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold uppercase text-amber-200">
                          Host
                        </span>
                      ) : null}
                      {isMe ? (
                        <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold uppercase text-sky-200">
                          You
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
                    <span className="rounded-full bg-white/5 px-3 py-1 font-semibold uppercase tracking-[0.25em] text-slate-300">
                      {roomPlayer.is_ready ? "Ready" : "Joining"}
                    </span>
                    <span>
                      Joined {new Date(roomPlayer.joined_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-10 text-center text-slate-400">
              Waiting for players to join...
            </div>
          )}
        </div>
      </section>

      {canStart ? (
        <button
          className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-500 via-sky-500 to-purple-500 px-6 py-3 text-base font-semibold text-white shadow-glow transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-4 text-sm text-slate-300">
          {playerCount < 4
            ? "Waiting for additional players to join..."
            : nextStarter
              ? `Waiting for ${nextStarter.user.display_name} to start the game...`
              : "Waiting for the designated starter..."}
        </div>
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
