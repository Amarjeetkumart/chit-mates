import { apiClient } from "./client";
import type {
  RoomCreateRequest,
  RoomCreateResponse,
  RoomJoinRequest,
  RoomJoinResponse,
  RoomRead,
} from "../types/api";

export async function createRoom(payload: RoomCreateRequest): Promise<RoomCreateResponse> {
  const { data } = await apiClient.post<RoomCreateResponse>("/rooms/create", payload);
  return data;
}

export async function joinRoom(payload: RoomJoinRequest): Promise<RoomJoinResponse> {
  const { data } = await apiClient.post<RoomJoinResponse>("/rooms/join", payload);
  return data;
}

export async function fetchRoom(roomCode: string): Promise<RoomRead> {
  const { data } = await apiClient.get<RoomRead>(`/rooms/${roomCode}`);
  return data;
}
