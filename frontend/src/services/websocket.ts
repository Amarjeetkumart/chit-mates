import type { GameStateResponse, RoomRead } from "../types/api";
import { getWebSocketUrl } from "../api/client";

export type GameSocketEvent =
  | {
      type: "game_state";
      payload: GameStateResponse;
    }
  | {
      type: "room_state";
      payload: RoomRead;
    };

export type WebSocketDisconnect = () => void;

export function connectToRoomSocket(
  roomCode: string,
  onEvent: (event: GameSocketEvent) => void,
  onStatusChange?: (connected: boolean) => void,
): WebSocketDisconnect {
  const socketUrl = getWebSocketUrl(roomCode);
  const socket = new WebSocket(socketUrl);

  const notifyStatus = (status: boolean) => {
    if (onStatusChange) {
      onStatusChange(status);
    }
  };

  socket.addEventListener("open", () => notifyStatus(true));
  socket.addEventListener("close", () => notifyStatus(false));
  socket.addEventListener("error", () => notifyStatus(false));

  socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data ?? "{}") as GameSocketEvent;
      if (data?.type === "game_state" || data?.type === "room_state") {
        onEvent(data);
      }
    } catch (error) {
      console.error("Failed to parse websocket event", error);
    }
  });

  return () => {
    notifyStatus(false);
    socket.close(1000, "client closed");
  };
}
