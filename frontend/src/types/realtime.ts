export type ChatMessageType = "user" | "system";

export interface ChatMessage {
  id: string;
  roomCode: string;
  playerId: string | null;
  displayName: string;
  content: string;
  timestamp: string;
  type: ChatMessageType;
  systemEvent?: string | null;
}

export interface TypingIndicator {
  playerId: string;
  displayName: string;
}

export interface ChatRateLimitPayload {
  retryAfter: number;
}

export interface VoiceParticipant {
  playerId: string;
  displayName: string;
  isMuted: boolean;
  isAutoMuted: boolean;
  pushToTalkPressed: boolean;
}

export interface VoiceParticipantsPayload {
  participants: VoiceParticipant[];
}

export interface VoiceStatusPayload extends VoiceParticipant {}

export interface VoiceInactivePayload {
  reason: "match_inactive" | string;
}

export interface VoiceShutdownPayload {
  reason: "match_complete" | "manual" | string;
}

export interface ServerToClientEvents {
  "chat:history": (messages: ChatMessage[]) => void;
  "chat:message": (message: ChatMessage) => void;
  "chat:typing": (payload: { players: TypingIndicator[] }) => void;
  "chat:rate_limited": (payload: ChatRateLimitPayload) => void;
  "chat:error": (payload: { message: string }) => void;
  "voice:participants": (payload: VoiceParticipantsPayload) => void;
  "voice:status": (payload: VoiceStatusPayload) => void;
  "voice:offer": (payload: { fromPlayerId: string; sdp: RTCSessionDescriptionInit }) => void;
  "voice:answer": (payload: { fromPlayerId: string; sdp: RTCSessionDescriptionInit }) => void;
  "voice:ice-candidate": (payload: { fromPlayerId: string; candidate: RTCIceCandidateInit }) => void;
  "voice:inactive": (payload: VoiceInactivePayload) => void;
  "voice:shutdown": (payload: VoiceShutdownPayload) => void;
}

export interface ClientToServerEvents {
  "chat:message": (payload: { content: string }) => void;
  "chat:typing": (payload: { isTyping: boolean }) => void;
  "voice:ready": () => void;
  "voice:offer": (payload: { targetPlayerId: string; sdp: RTCSessionDescriptionInit }) => void;
  "voice:answer": (payload: { targetPlayerId: string; sdp: RTCSessionDescriptionInit }) => void;
  "voice:ice-candidate": (payload: { targetPlayerId: string; candidate: RTCIceCandidateInit }) => void;
  "voice:mute": (payload: { isMuted: boolean }) => void;
  "voice:auto-mute": (payload: { isMuted: boolean }) => void;
  "voice:push-to-talk": (payload: { isPressed: boolean }) => void;
  "voice:leave": () => void;
}
