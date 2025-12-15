import { useState, type FormEvent } from "react";
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
    <div className="page">
      <header className="page__header">
        <h1>Chit Multiplayer Card Game</h1>
        <p>Host a room or join an existing game to start playing with friends in real time.</p>
      </header>

      <div className="panels">
        <section className="panel">
          <h2>Create a Room</h2>
          <form className="form" onSubmit={onCreateRoom}>
            <label className="form__label">
              Your Name
              <input
                className="form__input"
                required
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
                placeholder="Host name"
              />
            </label>
            <label className="form__label">
              Number of Games
              <input
                className="form__input"
                required
                type="number"
                min={1}
                max={50}
                value={rounds}
                onChange={(event) => setRounds(Number.parseInt(event.target.value, 10) || DEFAULT_ROUNDS)}
              />
            </label>
            <button className="button" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Room"}
            </button>
            {createMutation.isError ? <p className="form__error">{(createMutation.error as Error).message}</p> : null}
          </form>
        </section>

        <section className="panel">
          <h2>Join a Room</h2>
          <form className="form" onSubmit={onJoinRoom}>
            <label className="form__label">
              Room Code
              <input
                className="form__input"
                required
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Enter room code"
              />
            </label>
            <label className="form__label">
              Your Name
              <input
                className="form__input"
                required
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                placeholder="Player name"
              />
            </label>
            <button className="button" type="submit" disabled={joinMutation.isPending}>
              {joinMutation.isPending ? "Joining..." : "Join Room"}
            </button>
            {joinMutation.isError ? <p className="form__error">{(joinMutation.error as Error).message}</p> : null}
          </form>
        </section>
      </div>
    </div>
  );
}
