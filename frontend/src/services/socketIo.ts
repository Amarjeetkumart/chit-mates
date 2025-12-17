import { io, type Socket } from "socket.io-client";

import type { ClientToServerEvents, ServerToClientEvents } from "../types/realtime";
import { getSocketBaseUrl } from "../api/client";

export type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createRoomSocket(roomCode: string, playerId: string, displayName: string): RoomSocket {
  const baseUrl = getSocketBaseUrl();
  const socket = io(baseUrl, {
    path: "/ws/socket.io",
    transports: ["websocket"],
    withCredentials: false,
    autoConnect: false,
    forceNew: true,
    auth: {
      roomCode,
      playerId,
      displayName,
    },
  });
  return socket as RoomSocket;
}
