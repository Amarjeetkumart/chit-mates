import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";

import { createRoom, joinRoom } from "../api/rooms";
import { useGameStore } from "../store/useGameStore";

const DEFAULT_ROUNDS = 3;

export function HomePage() {
  const navigate = useNavigate();
  const setRoomFromCreate = useGameStore((state) => state.setRoomFromCreate);
  const setRoomFromJoin = useGameStore((state) => state.setRoomFromJoin);
  const resetStore = useGameStore((state) => state.reset);

  const [hostName, setHostName] = useState("");
  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const clampRounds = (value: number) => {
    if (Number.isNaN(value) || value <= 0) {
      return 1;
    }
    return Math.min(50, Math.max(1, value));
  };

  const adjustRounds = (delta: number) => {
    setRounds((previous) => clampRounds(previous + delta));
  };

  const onRoundsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(event.target.value, 10);
    setRounds(clampRounds(parsed));
  };

  const createMutation = useMutation({
    mutationFn: createRoom,
    onSuccess: (response) => {
      resetStore();
      setRoomFromCreate(response);
      navigate(`/lobby/${response.room.code}`);
    },
  });

  const joinMutation = useMutation({
    mutationFn: joinRoom,
    onSuccess: (response) => {
      resetStore();
      setRoomFromJoin(response);
      navigate(`/lobby/${response.room.code}`);
    },
  });

  const onCreateRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hostName.trim()) {
      return;
    }
    createMutation.mutate({ host_display_name: hostName.trim(), total_rounds: rounds });
  };

  const onJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!joinName.trim() || !joinCode.trim()) {
      return;
    }
    joinMutation.mutate({ display_name: joinName.trim(), room_code: joinCode.trim().toUpperCase() });
  };

  return (
    <div className="space-y-10">
      <header className="space-y-4 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-sky-300 shadow-card backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          Real-time Multiplayer Sessions
        </div>
        <div className="space-y-3">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Chit Multiplayer Card Game
          </h1>
          <p className="max-w-3xl text-lg text-slate-300">
            Host a vibrant lobby or jump into an existing room, pass animated cards, and climb the leaderboard with your
            squad.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-8 shadow-card backdrop-blur">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-500/30 blur-2xl" />
          <div className="pointer-events-none absolute bottom-8 right-8 h-32 w-32 rounded-full bg-rose-500/40 blur-2xl" />
          <div className="relative space-y-6">
            <h2 className="text-2xl font-semibold text-white">Create a Room</h2>
            <form className="space-y-5" onSubmit={onCreateRoom}>
              <label className="block space-y-2 text-sm font-medium text-slate-200">
                Your Name
                <input
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-base text-white shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  required
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder="Host name"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-slate-200">
                Number of Games
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => adjustRounds(-1)}
                    disabled={rounds <= 1}
                    aria-label="Decrease games"
                    className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-lg font-semibold text-slate-200 transition hover:border-sky-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    −
                  </button>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-center text-base text-white shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    required
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={rounds}
                    onChange={onRoundsChange}
                  />
                  <button
                    type="button"
                    onClick={() => adjustRounds(1)}
                    disabled={rounds >= 50}
                    aria-label="Increase games"
                    className="rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-lg font-semibold text-slate-200 transition hover:border-sky-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </label>
              <button
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 via-brand-500 to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Room"}
              </button>
              {createMutation.isError ? (
                <p className="text-sm font-semibold text-rose-300">{(createMutation.error as Error).message}</p>
              ) : null}
            </form>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 shadow-card backdrop-blur">
          <div className="pointer-events-none absolute -left-20 top-10 h-48 w-48 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-[-4rem] right-[-4rem] h-40 w-40 rounded-full bg-sky-400/25 blur-2xl" />
          <div className="relative space-y-6">
            <h2 className="text-2xl font-semibold text-white">Join a Room</h2>
            <form className="space-y-5" onSubmit={onJoinRoom}>
              <label className="block space-y-2 text-sm font-medium text-slate-200">
                Room Code
                <input
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-base text-white shadow-inner focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  required
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value)}
                  placeholder="Enter room code"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium text-slate-200">
                Your Name
                <input
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-base text-white shadow-inner focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  required
                  value={joinName}
                  onChange={(event) => setJoinName(event.target.value)}
                  placeholder="Player name"
                />
              </label>
              <button
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-purple-500 via-sky-500 to-cyan-400 px-5 py-3 text-sm font-semibold text-white shadow-glow transition hover:shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={joinMutation.isPending}
              >
                {joinMutation.isPending ? "Joining..." : "Join Room"}
              </button>
              {joinMutation.isError ? (
                <p className="text-sm font-semibold text-rose-300">{(joinMutation.error as Error).message}</p>
              ) : null}
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
