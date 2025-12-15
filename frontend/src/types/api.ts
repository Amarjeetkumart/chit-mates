export type CardType = "heart" | "diamond" | "tree" | "black_jack";

export interface UserRead {
  id: string;
  display_name: string;
}

export interface RoomPlayerRead {
  id: string;
  seat_position: number;
  is_ready: boolean;
  is_active: boolean;
  joined_at: string;
  user: UserRead;
}

export type RoomStatus = "waiting" | "active" | "completed";

export interface RoomRead {
  id: string;
  code: string;
  status: RoomStatus;
  created_at: string;
  updated_at: string;
  host_user_id: string;
  max_players: number;
  configured_rounds: number;
  players: RoomPlayerRead[];
  active_game_id: string | null;
}

export interface RoomCreateRequest {
  host_display_name: string;
  total_rounds: number;
}

export interface RoomCreateResponse {
  room: RoomRead;
  host: RoomPlayerRead;
  total_rounds: number;
}

export interface RoomJoinRequest {
  room_code: string;
  display_name: string;
}

export interface RoomJoinResponse {
  room: RoomRead;
  player: RoomPlayerRead;
}

export interface GamePlayerState {
  game_player_id: string;
  room_player_id: string;
  display_name: string;
  seat_position: number;
  is_active: boolean;
  finish_position: number | null;
  score: number;
  cards: CardType[];
}

export type RoundStatus = "waiting" | "running" | "finished";
export type GameStatus = "created" | "in_progress" | "completed";

export interface RoundPublicState {
  round_id: string;
  game_id: string;
  status: RoundStatus;
  active_player_id: string | null;
  turn_counter: number;
  finish_order: string[];
  winner_cards: Record<string, CardType>;
  players: GamePlayerState[];
  draw_players: string[];
}

export interface GameStateResponse {
  game_id: string;
  room_id: string;
  status: GameStatus;
  current_round: RoundPublicState | null;
  total_rounds: number;
  current_round_index: number;
}

export interface GameStartRequest {
  room_code: string;
  room_player_id: string;
}

export interface PassCardRequest {
  round_id: string;
  sender_id: string;
  card_type: CardType;
}

export interface PassCardResponse {
  state: RoundPublicState;
  score_updates: Record<string, number>;
  draw_players: string[];
}

export interface NextRoundRequest {
  game_id: string;
  room_player_id: string;
}

export interface NextRoundResponse {
  state: RoundPublicState;
  current_round_index: number;
}

export interface LeaderboardEntryModel {
  user_id: string;
  display_name: string;
  total_points: number;
  wins: number;
  second_places: number;
  third_places: number;
  losses: number;
  games_played: number;
  updated_at: string;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntryModel[];
}
