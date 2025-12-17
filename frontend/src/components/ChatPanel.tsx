import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import type { RoomPlayerRead } from "../types/api";
import type { ChatMessage, TypingIndicator } from "../types/realtime";
import type { RoomSocket } from "../services/socketIo";

interface ChatPanelProps {
  socket: RoomSocket | null;
  roomCode: string | undefined;
  player: RoomPlayerRead | null;
  isConnected: boolean;
}

export function ChatPanel({ socket, roomCode, player, isConnected }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState<TypingIndicator[]>([]);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef<number | undefined>(undefined);

  const selfPlayerId = player?.id ?? null;

  useEffect(() => {
    setMessages([]);
    setTyping([]);
    setDraft("");
  }, [roomCode]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleHistory = (history: ChatMessage[]) => {
      setMessages(history);
    };

    const handleMessage = (message: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-199), message]);
    };

    const handleTyping = (payload: { players: TypingIndicator[] }) => {
      const filtered = payload.players.filter((entry) => entry.playerId !== selfPlayerId);
      setTyping(filtered);
    };

    const handleRateLimited = (payload: { retryAfter: number }) => {
      const countdown = Math.max(1, Math.round(payload.retryAfter));
      setRateLimitCountdown(countdown);
      setError("You are sending messages too quickly");
    };

    const handleError = (payload: { message: string }) => {
      setError(payload.message);
    };

    socket.on("chat:history", handleHistory);
    socket.on("chat:message", handleMessage);
    socket.on("chat:typing", handleTyping);
    socket.on("chat:rate_limited", handleRateLimited);
    socket.on("chat:error", handleError);

    return () => {
      socket.off("chat:history", handleHistory);
      socket.off("chat:message", handleMessage);
      socket.off("chat:typing", handleTyping);
      socket.off("chat:rate_limited", handleRateLimited);
      socket.off("chat:error", handleError);
    };
  }, [socket, selfPlayerId]);

  useEffect(() => {
    if (!rateLimitCountdown) {
      setError(null);
      return;
    }
    if (rateLimitCountdown <= 0) {
      setRateLimitCountdown(null);
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setRateLimitCountdown((value) => (value === null ? null : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [rateLimitCountdown]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const typingIndicator = useMemo(() => {
    if (!typing.length) {
      return null;
    }
    if (typing.length === 1) {
      return `${typing[0].displayName} is typing...`;
    }
    if (typing.length === 2) {
      return `${typing[0].displayName} and ${typing[1].displayName} are typing...`;
    }
    const first = typing[0]?.displayName ?? "";
    return `${first} and others are typing...`;
  }, [typing]);

  const canSend = Boolean(socket && isConnected && draft.trim() && !rateLimitCountdown);

  const emitTypingState = (isTyping: boolean) => {
    if (!socket) {
      return;
    }
    socket.emit("chat:typing", { isTyping });
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!socket) {
      return;
    }
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      emitTypingState(true);
    }
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      emitTypingState(false);
      useEffect(() => {
        if (isConnected) {
          setError(null);
        }
      }, [isConnected]);
    }, 1500);
  };

  const handleSend = () => {
    if (!socket || !draft.trim()) {
      return;
    }
    socket.emit("chat:message", { content: draft.trim() });
    setDraft("");
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      emitTypingState(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        handleSend();
      }
    }
  };

  const connectionLabel = isConnected ? "Connected" : "Offline";
  const connectionTone = isConnected ? "text-emerald-300" : "text-rose-300";

  return (
    <section className="flex h-full flex-col rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-card backdrop-blur">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-white">Room Chat</h2>
          <p className="text-xs text-slate-400">Real-time updates for everyone in the match</p>
        </div>
        <span className={clsx("text-xs font-semibold", connectionTone)}>{connectionLabel}</span>
      </header>

      <div ref={scrollRef} className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/5 bg-slate-950/40 p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400">No messages yet. Start the conversation!</p>
        ) : (
          messages.map((message) => {
            const isSelf = selfPlayerId && message.playerId === selfPlayerId;
            const timestamp = formatTime(message.timestamp);
            if (message.type === "system") {
              return (
                <p
                  key={message.id}
                  className="text-center text-xs font-medium uppercase tracking-[0.3em] text-slate-400"
                >
                  {message.content}
                </p>
              );
            }
            return (
              <div key={message.id} className={clsx("flex flex-col gap-1", isSelf ? "items-end" : "items-start")}>
                <div
                  className={clsx(
                    "max-w-[80%] rounded-2xl border px-4 py-3 text-sm shadow",
                    isSelf
                      ? "border-sky-400/30 bg-sky-500/15 text-sky-100"
                      : "border-white/10 bg-white/5 text-slate-100",
                  )}
                >
                  <div className="flex items-center justify-between gap-4 text-xs text-slate-300">
                    <span className="font-semibold uppercase tracking-[0.25em] text-slate-200">
                      {isSelf ? "You" : message.displayName}
                    </span>
                    <time className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">{timestamp}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{message.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {typingIndicator ? (
        <div className="mt-2 text-xs text-slate-400">{typingIndicator}</div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (typingActiveRef.current) {
              typingActiveRef.current = false;
              emitTypingState(false);
            }
          }}
          placeholder={isConnected ? "Message your table..." : "Waiting for connection"}
          className="h-24 resize-none rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none focus:ring-1 focus:ring-sky-400/40"
          disabled={!isConnected}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {rateLimitCountdown ? `Please wait ${rateLimitCountdown}s before sending again.` : error}
          </span>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className={clsx(
              "inline-flex items-center rounded-2xl px-5 py-2 text-sm font-semibold transition",
              canSend
                ? "bg-gradient-to-r from-sky-500 via-brand-500 to-purple-500 text-white shadow-glow hover:scale-[1.01] hover:brightness-105"
                : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-400",
            )}
          >
            Send
          </button>
        </div>
      </div>
    </section>
  );
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
