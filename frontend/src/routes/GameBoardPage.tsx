import { useEffect, useMemo, useRef, useState } from "react";
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

interface CardVisual {
  icon: string;
  gradient: string;
  border: string;
  glow: string;
  accent: string;
}

const CARD_DETAILS: Record<CardType, CardVisual> = {
  heart: {
    icon: "♥",
    gradient: "from-rose-500/90 via-rose-500/80 to-orange-400/80",
    border: "border-rose-200/20",
    glow: "shadow-[0_18px_40px_-12px_rgba(244,63,94,0.6)]",
    accent: "text-rose-100",
  },
  diamond: {
    icon: "♦",
    gradient: "from-sky-500/90 via-cyan-400/80 to-emerald-400/80",
    border: "border-cyan-200/20",
    glow: "shadow-[0_18px_40px_-12px_rgba(14,165,233,0.55)]",
    accent: "text-cyan-100",
  },
  tree: {
    icon: "♣",
    gradient: "from-emerald-500/90 via-lime-500/80 to-teal-500/80",
    border: "border-emerald-200/20",
    glow: "shadow-[0_18px_40px_-12px_rgba(16,185,129,0.55)]",
    accent: "text-emerald-100",
  },
  black_jack: {
    icon: "♠",
    gradient: "from-purple-500/90 via-indigo-500/80 to-slate-900/85",
    border: "border-indigo-200/20",
    glow: "shadow-[0_18px_40px_-12px_rgba(99,102,241,0.58)]",
    accent: "text-indigo-100",
  },
};

interface FlightState {
  card: CardType;
  key: number;
}

interface FinalStanding extends GamePlayerState {
  rank: number;
  status: "champion" | "runner_up" | "third" | "loser";
}

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
  const [showFinalResults, setShowFinalResults] = useState(false);
  const [hasAcknowledgedResults, setHasAcknowledgedResults] = useState(false);
  const [flyingCard, setFlyingCard] = useState<FlightState | null>(null);
  const flightTimeoutRef = useRef<number | null>(null);
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

  useEffect(() => {
    return () => {
      if (flightTimeoutRef.current) {
        window.clearTimeout(flightTimeoutRef.current);
      }
    };
  }, []);

  const activeRound = game?.current_round ?? null;
  const myState = useMemo(() => resolvePlayerState(game, gamePlayerId), [game, gamePlayerId]);
  const isMyTurn = activeRound?.active_player_id === gamePlayerId && myState?.is_active;
  const drawPlayers = activeRound?.draw_players ?? [];
  const activePlayerName = useMemo(() => {
    if (!activeRound) {
      return null;
    }
    const currentActive = activeRound.players.find((playerState) => playerState.game_player_id === activeRound.active_player_id);
    return currentActive?.display_name ?? null;
  }, [activeRound]);
  const nextStarterSeat = sortedRoomPlayers.length
    ? ((game?.current_round_index ?? 0) % sortedRoomPlayers.length) + 1
    : null;
  const nextStarter = nextStarterSeat
    ? sortedRoomPlayers.find((roomPlayer) => roomPlayer.seat_position === nextStarterSeat)
    : undefined;
  const isNextRoundStarter = playerSeat === nextStarterSeat;
  const isGameComplete = Boolean(
    game &&
      ((game.status === "completed" && activeRound?.status === "finished") ||
        (game.current_round_index === game.total_rounds && activeRound?.status === "finished")),
  );
  const finalStandings = useMemo<FinalStanding[]>(() => {
    if (!activeRound || !activeRound.players.length) {
      return [];
    }
    const ordered = [...activeRound.players].sort((a, b) => b.score - a.score);
    return ordered.map((playerState, index, array) => {
      let status: FinalStanding["status"];
      if (index === 0) {
        status = "champion";
      } else if (index === 1) {
        status = "runner_up";
      } else if (index === array.length - 1) {
        status = "loser";
      } else {
        status = "third";
      }
      return {
        ...playerState,
        rank: index + 1,
        status,
      };
    });
  }, [activeRound]);

  useEffect(() => {
    if (isGameComplete && !hasAcknowledgedResults) {
      setShowFinalResults(true);
    }
    if (!isGameComplete) {
      setShowFinalResults(false);
      setHasAcknowledgedResults(false);
    }
  }, [isGameComplete, hasAcknowledgedResults]);

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

  const handleCloseResults = () => {
    setHasAcknowledgedResults(true);
    setShowFinalResults(false);
  };

  const handleReturnToLobby = () => {
    setHasAcknowledgedResults(true);
    setShowFinalResults(false);
    navigate("/");
  };

  const handlePassCard = (card: CardType) => {
    if (!activeRound || !gamePlayerId || passCardMutation.isPending) {
      return;
    }
    if (flightTimeoutRef.current) {
      window.clearTimeout(flightTimeoutRef.current);
    }
    const nextFlight: FlightState = { card, key: Date.now() };
    setFlyingCard(nextFlight);
    flightTimeoutRef.current = window.setTimeout(() => setFlyingCard(null), 700);
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
    <div className="relative space-y-8">
      {showFinalResults && finalStandings.length ? (
        <FinalResultsModal standings={finalStandings} onClose={handleCloseResults} onReturn={handleReturnToLobby} />
      ) : null}

      {flyingCard ? <FloatingCard key={flyingCard.key} card={flyingCard.card} /> : null}

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-white">Game Board</h1>
          <p className="text-slate-300">Pass vibrant cards, complete four-of-a-kind streaks, and climb the score ladder.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          {room ? (
            <>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-semibold text-slate-100">
                Room {room.code}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Round {game?.current_round_index ?? 1} / {game?.total_rounds ?? room.configured_rounds}
              </span>
              {nextStarter ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  Next starter: <span className="font-semibold text-sky-300">{nextStarter.user.display_name}</span>
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {lastMessage ? (
        <div className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 shadow-glow">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          {lastMessage}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-card backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-white">Your Hand</h2>
          <span className={clsx("text-sm", isMyTurn ? "text-emerald-300" : "text-slate-400")}>
            {isMyTurn ? "Your move — choose a card to pass" : "Waiting for other players"}
          </span>
        </div>
        <div className="mt-6 flex flex-wrap gap-4">
          {myState?.cards.length ? (
            myState.cards.map((card, index) => (
              <CardButton
                key={`${card}-${index}`}
                card={card}
                disabled={!isMyTurn || passCardMutation.isPending}
                onClick={() => handlePassCard(card)}
              />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 px-6 py-4 text-slate-300">No cards in hand</div>
          )}
        </div>
        {passCardMutation.isPending ? <p className="mt-4 text-sm text-slate-400">Sending card...</p> : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-card backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-white">Round Progress</h2>
          <span className="text-sm text-slate-300">Turn #{activeRound?.turn_counter ?? 0}</span>
        </div>
        <ol className="mt-6 space-y-3">
          {activeRound?.finish_order.length ? (
            activeRound.finish_order.map((playerId, index) => {
              const playerState = activeRound.players.find((p) => p.game_player_id === playerId);
              if (!playerState) {
                return null;
              }
              const isDraw = drawPlayers.includes(playerId);
              return (
                <li
                  key={playerId}
                  className={clsx(
                    "flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-5 py-3 transition",
                    isDraw ? "border-rose-400/30 bg-rose-500/10" : "hover:border-white/20"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/70 text-sm font-semibold text-slate-200">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-base font-semibold text-white">{playerState.display_name}</p>
                      <p className={clsx("text-xs uppercase tracking-[0.25em]", isDraw ? "text-rose-200" : "text-slate-400")}>
                        {isDraw ? "Draw" : `Finished ${playerState.finish_position ?? index + 1}`}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-300">
                    Score {playerState.score}
                  </span>
                </li>
              );
            })
          ) : (
            <li className="rounded-2xl border border-dashed border-white/20 px-6 py-4 text-sm text-slate-300">
              No finishers yet — keep passing!
            </li>
          )}
        </ol>
        {drawPlayers.length ? (
          <p className="mt-4 text-sm font-semibold text-rose-200">
            Draw detected between {drawPlayers.length} players. Scores locked in for this round.
          </p>
        ) : null}
        {activeRound?.status === "finished" && game && game.current_round_index < game.total_rounds && isNextRoundStarter ? (
          <button
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 via-sky-500 to-purple-500 px-6 py-3 text-base font-semibold text-white shadow-glow transition hover:scale-[1.01] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleStartNextRound}
            disabled={nextRoundMutation.isPending}
          >
            {nextRoundMutation.isPending ? "Starting next round..." : "Start Next Round"}
          </button>
        ) : null}
        {activeRound?.status === "finished" && game && game.current_round_index < game.total_rounds && !isNextRoundStarter && nextStarter ? (
          <p className="mt-4 rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-slate-300">
            Waiting for {nextStarter.user.display_name} to start the next round...
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-card backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-white">Players</h2>
          <span className="text-sm text-slate-400">
            {activePlayerName ? `Active: ${isMyTurn ? "You" : activePlayerName}` : "Waiting for first move"}
          </span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {activeRound?.players.map((playerState) => (
            <PlayerCard
              key={playerState.game_player_id}
              player={playerState}
              isMe={playerState.game_player_id === gamePlayerId}
              isActive={playerState.game_player_id === activeRound.active_player_id}
              isDraw={drawPlayers.includes(playerState.game_player_id)}
              isNextStarter={nextStarter?.id === playerState.room_player_id}
            />
          ))}
        </div>
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
  isNextStarter: boolean;
}
interface CardButtonProps {
  card: CardType;
  disabled: boolean;
  onClick: () => void;
}

function PlayerCard({ player, isMe, isActive, isDraw, isNextStarter }: PlayerCardProps) {
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition",
        isActive ? "border-sky-400/60 shadow-glow" : "hover:border-white/20",
        isDraw ? "opacity-75" : "",
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Seat {player.seat_position}</p>
          <h3 className="text-lg font-semibold text-white">{player.display_name}</h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {isMe ? (
            <span className="rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold uppercase text-sky-200">You</span>
          ) : null}
          {isActive ? (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase text-emerald-200">
              Turn
            </span>
          ) : null}
          {isNextStarter ? (
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold uppercase text-amber-200">
              Next Start
            </span>
          ) : null}
          {isDraw ? (
            <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold uppercase text-rose-200">
              Draw
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <span className="rounded-full bg-slate-900/70 px-3 py-1 font-semibold">Cards {player.cards.length}</span>
        <span className="rounded-full bg-slate-900/70 px-3 py-1 font-semibold">Score {player.score}</span>
        {player.finish_position ? (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-slate-200">
            #{player.finish_position}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function CardButton({ card, disabled, onClick }: CardButtonProps) {
  const detail = CARD_DETAILS[card];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "group relative h-44 w-28 overflow-hidden rounded-3xl border bg-gradient-to-br p-4 text-left text-white transition duration-300 focus:outline-none",
        detail.gradient,
        detail.border,
        detail.glow,
        disabled ? "cursor-not-allowed opacity-60" : "hover:-translate-y-2 hover:shadow-2xl hover:brightness-110",
      )}
    >
      <div className="flex h-full flex-col justify-between">
        <span className={clsx("text-4xl leading-none", detail.accent)}>{detail.icon}</span>
        <span className="text-lg font-semibold tracking-wide">{CARD_LABEL[card]}</span>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.16),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </button>
  );
}

function FloatingCard({ card }: { card: CardType }) {
  const detail = CARD_DETAILS[card];
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      <div
        className={clsx(
          "relative h-44 w-28 overflow-hidden rounded-3xl border bg-gradient-to-br p-4 text-white opacity-0 animate-card-flight",
          detail.gradient,
          detail.border,
          detail.glow,
        )}
      >
        <div className="flex h-full flex-col justify-between">
          <span className={clsx("text-4xl leading-none", detail.accent)}>{detail.icon}</span>
          <span className="text-lg font-semibold tracking-wide">{CARD_LABEL[card]}</span>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.2),transparent)]" />
      </div>
    </div>
  );
}

interface FinalResultsModalProps {
  standings: FinalStanding[];
  onClose: () => void;
  onReturn: () => void;
}

function FinalResultsModal({ standings, onClose, onReturn }: FinalResultsModalProps) {
  if (!standings.length) {
    return null;
  }

  const champion = standings[0];
  const statusLabel: Record<FinalStanding["status"], string> = {
    champion: "Champion",
    runner_up: "Runner-up",
    third: "Third Place",
    loser: "Loser",
  };
  const cardBackground: Record<FinalStanding["status"], string> = {
    champion: "from-amber-500/25 via-rose-500/20 to-orange-400/15",
    runner_up: "from-sky-500/25 via-blue-500/15 to-indigo-500/15",
    third: "from-emerald-500/20 via-teal-500/15 to-sky-500/10",
    loser: "from-rose-500/25 via-red-500/20 to-slate-900/25",
  };
  const badgeTone: Record<FinalStanding["status"], string> = {
    champion: "bg-amber-500/20 text-amber-200",
    runner_up: "bg-sky-500/20 text-sky-200",
    third: "bg-emerald-500/20 text-emerald-200",
    loser: "bg-rose-500/25 text-rose-200",
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur overflow-y-auto lg:overflow-visible">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-slate-900/95 via-slate-900/85 to-slate-900/70 p-8 text-slate-100 shadow-[0_45px_140px_-45px_rgba(59,130,246,0.75)] animate-modal-pop max-h-[calc(100dvh-3rem)] overflow-y-auto sm:max-h-[calc(100dvh-4rem)] lg:max-h-none lg:overflow-visible">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-5rem] right-[-3rem] h-60 w-60 rounded-full bg-rose-500/20 blur-3xl" />

        <div className="relative space-y-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-amber-200 animate-badge-pulse">
            Final Results
          </span>
          <h2 className="font-heading text-3xl font-semibold text-white">
            {champion ? `${champion.display_name} reigns supreme!` : "Game Complete"}
          </h2>
          {/* <p className="text-sm text-slate-300">
            Scores are locked in after all rounds. Celebrate the winners and rally the squad for the next match.
          </p> */}
        </div>

        <ul className="relative mt-8 grid gap-4 sm:grid-cols-2">
          {standings.map((player) => (
            <li
              key={player.game_player_id}
              className={clsx(
                "group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br p-6 backdrop-blur-sm",
                cardBackground[player.status],
              )}
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-300">#{player.rank}</p>
                  <h3 className="text-xl font-semibold text-white">{player.display_name}</h3>
                </div>
                <span className="rounded-full bg-slate-900/60 px-3 py-1 text-xs font-semibold text-slate-200">
                  {player.score} pts
                </span>
              </div>
              <div className="relative mt-5 flex items-center justify-between gap-3 text-sm text-slate-200">
                <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em]", badgeTone[player.status])}>
                  {statusLabel[player.status]}
                </span>
                {player.status === "champion" ? <span className="text-2xl">🏆</span> : null}
                {player.status === "loser" ? <span className="text-2xl">💀</span> : null}
              </div>
              <p className="relative mt-3 text-xs text-slate-300">
                Cards remaining: {player.cards.length} · Seat {player.seat_position}
              </p>
            </li>
          ))}
        </ul>

        <div className="relative mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/25 hover:bg-white/10"
          >
            View Board
          </button>
          <button
            type="button"
            onClick={onReturn}
            className="rounded-2xl bg-gradient-to-r from-sky-500 via-brand-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.01] hover:brightness-110"
          >
            Start New Game
          </button>
        </div>
      </div>
    </div>
  );
}
