import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: false,
});

export function getWebSocketUrl(roomCode: string): string {
  const wsBase = import.meta.env.VITE_WS_BASE_URL;
  if (wsBase) {
    const normalized = wsBase.endsWith("/") ? wsBase.slice(0, -1) : wsBase;
    return `${normalized}/ws/rooms/${roomCode}`;
  }

  try {
    const url = new URL(API_BASE_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const path = url.pathname.replace(/\/?api\/?$/, "");
    const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
    return `${url.origin}${normalizedPath}/ws/rooms/${roomCode}`;
  } catch {
    // Fallback for relative URLs
    const base = API_BASE_URL.replace(/^http/, "ws").replace(/\/?api\/?$/, "");
    return `${base}/ws/rooms/${roomCode}`;
  }
}
