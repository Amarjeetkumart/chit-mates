import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  GameStateResponse,
  RoomCreateResponse,
  RoomJoinResponse,
  RoomPlayerRead,
  RoomRead,
} from "../types/api";

interface GameStoreState {
  room: RoomRead | null;
  player: RoomPlayerRead | null;
  game: GameStateResponse | null;
  gamePlayerId: string | null;
  socketConnected: boolean;
  setRoomFromCreate(response: RoomCreateResponse): void;
  setRoomFromJoin(response: RoomJoinResponse): void;
  setRoom(room: RoomRead): void;
  setGameState(state: GameStateResponse): void;
  setGamePlayerId(gamePlayerId: string | null): void;
  setSocketConnected(connected: boolean): void;
  reset(): void;
}

export const useGameStore = create<GameStoreState>()(
  persist(
    (set) => ({
      room: null,
      player: null,
      game: null,
      gamePlayerId: null,
      socketConnected: false,
      setRoomFromCreate: (response) =>
        set({
          room: response.room,
          player: response.host,
          game: null,
          gamePlayerId: null,
        }),
      setRoomFromJoin: (response) =>
        set({
          room: response.room,
          player: response.player,
          game: null,
          gamePlayerId: null,
        }),
      setRoom: (room) => set({ room }),
      setGameState: (state) => set({ game: state }),
      setGamePlayerId: (gamePlayerId) => set({ gamePlayerId }),
      setSocketConnected: (connected) => set({ socketConnected: connected }),
      reset: () =>
        set({
          room: null,
          player: null,
          game: null,
          gamePlayerId: null,
          socketConnected: false,
        }),
    }),
    {
      name: "chit-game-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        room: state.room,
        player: state.player,
        game: state.game,
        gamePlayerId: state.gamePlayerId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        state.setSocketConnected(false);
      },
    },
  ),
);
