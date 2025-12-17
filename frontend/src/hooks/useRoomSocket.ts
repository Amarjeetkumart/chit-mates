import { useEffect, useRef, useState } from "react";

import type { RoomPlayerRead } from "../types/api";
import type { RoomSocket } from "../services/socketIo";
import { createRoomSocket } from "../services/socketIo";

interface UseRoomSocketResult {
  socket: RoomSocket | null;
  isConnected: boolean;
  isReconnecting: boolean;
}

export function useRoomSocket(roomCode: string | undefined, player: RoomPlayerRead | null): UseRoomSocketResult {
  const socketRef = useRef<RoomSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    if (!roomCode || !player) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setIsReconnecting(false);
      return;
    }

    const socket = createRoomSocket(roomCode, player.id, player.user.display_name);
    socketRef.current = socket;

    const handleConnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleReconnectAttempt = () => {
      setIsReconnecting(true);
    };

    const handleConnectError = () => {
      setIsConnected(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect", handleConnect);
    socket.io.on("error", handleConnectError);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect", handleConnect);
      socket.io.off("error", handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, player?.id, player?.user.display_name]);

  return {
    socket: socketRef.current,
    isConnected,
    isReconnecting,
  };
}
