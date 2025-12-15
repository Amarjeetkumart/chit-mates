import { apiClient } from "./client";
import type {
  GameStartRequest,
  GameStateResponse,
  NextRoundRequest,
  NextRoundResponse,
  PassCardRequest,
  PassCardResponse,
} from "../types/api";

export async function startGame(payload: GameStartRequest): Promise<GameStateResponse> {
  const { data } = await apiClient.post<GameStateResponse>("/game/start", payload);
  return data;
}

export async function passCard(payload: PassCardRequest): Promise<PassCardResponse> {
  const { data } = await apiClient.post<PassCardResponse>("/game/pass-card", payload);
  return data;
}

export async function fetchGameState(gameId: string): Promise<GameStateResponse> {
  const { data } = await apiClient.get<GameStateResponse>(`/game/state/${gameId}`);
  return data;
}

export async function startNextRound(payload: NextRoundRequest): Promise<NextRoundResponse> {
  const { data } = await apiClient.post<NextRoundResponse>("/game/next-round", payload);
  return data;
}
