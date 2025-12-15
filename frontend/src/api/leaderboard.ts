import { apiClient } from "./client";
import type { LeaderboardResponse } from "../types/api";

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const { data } = await apiClient.get<LeaderboardResponse>("/leaderboard");
  return data;
}
