import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import type { RoomPlayerRead } from "../types/api";
import type { VoiceParticipant, VoiceParticipantsPayload } from "../types/realtime";
import type { RoomSocket } from "../services/socketIo";

const DEFAULT_STUN_SERVERS = (import.meta.env.VITE_VOICE_STUN_SERVERS as string | undefined)?.split(",").map((value) => value.trim()).filter(Boolean) ?? [
  "stun:stun.l.google.com:19302",
];

interface VoicePanelProps {
  socket: RoomSocket | null;
  roomCode: string | undefined;
  player: RoomPlayerRead | null;
  isConnected: boolean;
  isMatchActive: boolean;
  shouldForceDisconnect: boolean;
}

interface PeerRecord {
  connection: RTCPeerConnection;
  targetPlayerId: string;
  negotiated: boolean;
}

export function VoicePanel({
  socket,
  roomCode,
  player,
  isConnected,
  isMatchActive,
  shouldForceDisconnect,
}: VoicePanelProps) {
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "starting" | "online">("idle");
  const [manualMuted, setManualMuted] = useState(true);
  const [autoMuted, setAutoMuted] = useState(false);
  const [pushActive, setPushActive] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerRecord>>(new Map());
  const remoteStreamRef = useRef<Map<string, MediaStream>>(new Map());
  const pushReleasedRef = useRef(false);

  const selfPlayerId = player?.id ?? null;
  const isOnline = voiceStatus === "online";
  const canJoin = Boolean(socket && isConnected && isMatchActive && roomCode && player);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleParticipants = (payload: VoiceParticipantsPayload) => {
      setParticipants(payload.participants);
      if (!selfPlayerId) {
        return;
      }
      void syncPeerConnections(payload.participants);
    };

    const handleStatus = (payload: VoiceParticipant) => {
      setParticipants((previous) => updateParticipantList(previous, payload));
      if (payload.playerId === selfPlayerId) {
        setManualMuted(payload.isMuted);
        setAutoMuted(payload.isAutoMuted);
        setPushActive(payload.pushToTalkPressed);
      }
    };

    const handleOffer = async (payload: { fromPlayerId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!selfPlayerId || !socket || !localStreamRef.current) {
        return;
      }
      const targetId = payload.fromPlayerId;
      const peer = await ensurePeerConnection(targetId, socket);
      await peer.connection.setRemoteDescription(payload.sdp);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      socket.emit("voice:answer", { targetPlayerId: targetId, sdp: answer });
      peer.negotiated = true;
    };

    const handleAnswer = async (payload: { fromPlayerId: string; sdp: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current.get(payload.fromPlayerId);
      if (!peer) {
        return;
      }
      await peer.connection.setRemoteDescription(payload.sdp);
      peer.negotiated = true;
    };

    const handleCandidate = async (payload: { fromPlayerId: string; candidate: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(payload.fromPlayerId);
      if (!peer || !payload.candidate) {
        return;
      }
      try {
        await peer.connection.addIceCandidate(payload.candidate);
      } catch (error) {
        console.error("Failed to add ICE candidate", error);
      }
    };

    const handleInactive = () => {
      setVoiceError("Voice chat is available only during an active match");
      setInfoMessage(null);
      if (voiceStatus !== "idle") {
        stopVoice("match_inactive");
      }
    };

    const handleShutdown = (payload: { reason: string }) => {
      stopVoice(payload.reason);
      setInfoMessage("Voice channel closed — match completed");
    };

    socket.on("voice:participants", handleParticipants);
    socket.on("voice:status", handleStatus);
    socket.on("voice:offer", handleOffer);
    socket.on("voice:answer", handleAnswer);
    socket.on("voice:ice-candidate", handleCandidate);
    socket.on("voice:inactive", handleInactive);
    socket.on("voice:shutdown", handleShutdown);

    return () => {
      socket.off("voice:participants", handleParticipants);
      socket.off("voice:status", handleStatus);
      socket.off("voice:offer", handleOffer);
      socket.off("voice:answer", handleAnswer);
      socket.off("voice:ice-candidate", handleCandidate);
      socket.off("voice:inactive", handleInactive);
      socket.off("voice:shutdown", handleShutdown);
    };
  }, [socket, selfPlayerId, voiceStatus]);

  useEffect(() => {
    if (!socket) {
      stopVoice();
    }
  }, [socket]);

  useEffect(() => {
    if (shouldForceDisconnect && voiceStatus !== "idle") {
      stopVoice("match_complete");
      setInfoMessage("Voice chat disconnected — match ended");
    }
  }, [shouldForceDisconnect, voiceStatus]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!isOnline || !socket) {
        return;
      }
      const hidden = document.hidden;
      setAutoMuted(hidden);
      socket.emit("voice:auto-mute", { isMuted: hidden });
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [socket, isOnline]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    applyTrackState();
  }, [isOnline, manualMuted, autoMuted, pushActive]);

  useEffect(() => {
    if (!pushActive) {
      return;
    }
    const handleRelease = () => {
      pushReleasedRef.current = true;
      setPushActive(false);
      if (socket) {
        socket.emit("voice:push-to-talk", { isPressed: false });
      }
    };
    window.addEventListener("mouseup", handleRelease);
    window.addEventListener("touchend", handleRelease);
    window.addEventListener("mouseleave", handleRelease);
    return () => {
      window.removeEventListener("mouseup", handleRelease);
      window.removeEventListener("touchend", handleRelease);
      window.removeEventListener("mouseleave", handleRelease);
    };
  }, [pushActive, socket]);

  useEffect(() => {
    const peers = peersRef.current;
    return () => {
      peers.forEach((record) => record.connection.close());
    };
  }, []);

  const activeParticipants = useMemo(() => {
    return participants.map((participant) => {
      const effectiveMuted = participant.isMuted || participant.isAutoMuted;
      const isSpeaking = !effectiveMuted && participant.pushToTalkPressed;
      return {
        ...participant,
        effectiveMuted,
        isSpeaking,
      };
    });
  }, [participants]);

  const startVoice = async () => {
    if (!canJoin) {
      setVoiceError("Connect to the room and start the match to enable voice chat");
      return;
    }
    if (voiceStatus !== "idle") {
      return;
    }
    try {
      setVoiceError(null);
      setInfoMessage(null);
      setVoiceStatus("starting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      localStreamRef.current = stream;
      setManualMuted(true);
      setAutoMuted(false);
      setPushActive(false);
      setVoiceStatus("online");
      socket?.emit("voice:ready");
      setInfoMessage("Voice chat enabled — hold Push to Talk or unmute");
    } catch (error) {
      console.error("Microphone access error", error);
      setVoiceError("Microphone access denied. Please allow audio permissions.");
      setVoiceStatus("idle");
    }
  };

  const stopVoice = (reason?: string) => {
    peersRef.current.forEach((record) => {
      record.connection.onicecandidate = null;
      record.connection.ontrack = null;
      record.connection.close();
    });
    peersRef.current.clear();

    remoteStreamRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    remoteStreamRef.current.clear();
    setRemoteStreams({});

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (socket) {
      socket.emit("voice:leave");
    }

    setVoiceStatus("idle");
    setManualMuted(true);
    setAutoMuted(false);
    setPushActive(false);
    if (reason === "match_inactive") {
      setInfoMessage("Voice unavailable until the next match starts");
    }
  };

  const handleToggleMute = () => {
    if (!socket || !isOnline) {
      return;
    }
    const next = !manualMuted;
    setManualMuted(next);
    socket.emit("voice:mute", { isMuted: next });
  };

  const handlePushStart = () => {
    if (!socket || !isOnline) {
      return;
    }
    pushReleasedRef.current = false;
    setPushActive(true);
    socket.emit("voice:push-to-talk", { isPressed: true });
  };

  const handlePushEnd = () => {
    if (!socket || !isOnline || pushReleasedRef.current) {
      pushReleasedRef.current = false;
      return;
    }
    setPushActive(false);
    socket.emit("voice:push-to-talk", { isPressed: false });
  };

  const syncPeerConnections = async (current: VoiceParticipant[]) => {
    if (!socket || !localStreamRef.current || !selfPlayerId) {
      return;
    }
    const activeIds = new Set(current.filter((participant) => participant.playerId !== selfPlayerId).map((participant) => participant.playerId));

    peersRef.current.forEach((record, id) => {
      if (!activeIds.has(id)) {
        record.connection.close();
        peersRef.current.delete(id);
        const remote = remoteStreamRef.current.get(id);
        if (remote) {
          remote.getTracks().forEach((track) => track.stop());
          remoteStreamRef.current.delete(id);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      }
    });

    for (const participantId of activeIds) {
      const peer = await ensurePeerConnection(participantId, socket);
      if (peer.connection.signalingState === "stable" && !peer.negotiated) {
        try {
          const offer = await peer.connection.createOffer();
          await peer.connection.setLocalDescription(offer);
          socket.emit("voice:offer", { targetPlayerId: participantId, sdp: offer });
          peer.negotiated = true;
        } catch (error) {
          console.error("Offer creation failed", error);
        }
      }
    }
  };

  const ensurePeerConnection = async (targetPlayerId: string, socketInstance: RoomSocket): Promise<PeerRecord> => {
    const existing = peersRef.current.get(targetPlayerId);
    if (existing) {
      return existing;
    }
    if (!localStreamRef.current) {
      throw new Error("Local stream missing");
    }

    const rtcConfig: RTCConfiguration = {
      iceServers: DEFAULT_STUN_SERVERS.map((url) => ({ urls: url })),
    };
    const connection = new RTCPeerConnection(rtcConfig);

    localStreamRef.current.getTracks().forEach((track) => connection.addTrack(track, localStreamRef.current!));

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        socketInstance.emit("voice:ice-candidate", { targetPlayerId, candidate: event.candidate });
      }
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }
      remoteStreamRef.current.set(targetPlayerId, stream);
      setRemoteStreams((prev) => ({ ...prev, [targetPlayerId]: stream }));
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
        connection.close();
        peersRef.current.delete(targetPlayerId);
        const remote = remoteStreamRef.current.get(targetPlayerId);
        if (remote) {
          remote.getTracks().forEach((track) => track.stop());
          remoteStreamRef.current.delete(targetPlayerId);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[targetPlayerId];
            return next;
          });
        }
      }
    };

    const record: PeerRecord = { connection, targetPlayerId, negotiated: false };
    peersRef.current.set(targetPlayerId, record);
    return record;
  };

  const applyTrackState = () => {
    if (!localStreamRef.current) {
      return;
    }
    const shouldEnable = !autoMuted && (!manualMuted || pushActive);
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = shouldEnable;
    });
  };

  const remoteAudioElements = Object.entries(remoteStreams).map(([participantId, stream]) => (
    <audio
      key={participantId}
      ref={(element) => {
        if (element && element.srcObject !== stream) {
          element.srcObject = stream;
          void element.play().catch(() => undefined);
        }
      }}
      autoPlay
      playsInline
      className="hidden"
    />
  ));

  const statusLabel = voiceStatus === "online" ? "Voice Live" : voiceStatus === "starting" ? "Connecting" : "Voice Idle";
  const statusTone = voiceStatus === "online" ? "text-emerald-300" : voiceStatus === "starting" ? "text-amber-300" : "text-slate-400";

  return (
    <section className="flex h-full flex-col rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-card backdrop-blur">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Voice Table</h2>
          <p className="text-xs text-slate-400">Push-to-talk peer audio while the match is active</p>
        </div>
        <span className={clsx("text-xs font-semibold", statusTone)}>{statusLabel}</span>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
          {isMatchActive ? "Match in progress" : "Waiting for match"}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
          {isConnected ? "Socket connected" : "Socket offline"}
        </span>
        {autoMuted ? (
          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-amber-200">
            Auto-muted (inactive tab)
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-300">Participants</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {activeParticipants.length === 0 ? (
              <li className="rounded-xl border border-dashed border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
                Voice lobby is empty. Enable voice to join.
              </li>
            ) : (
              activeParticipants.map((participant) => {
                const isYou = participant.playerId === selfPlayerId;
                const badgeTone = participant.isSpeaking
                  ? "bg-emerald-500/20 text-emerald-200"
                  : participant.effectiveMuted
                    ? "bg-rose-500/15 text-rose-200"
                    : "bg-sky-500/15 text-sky-200";
                const badgeLabel = participant.isSpeaking ? "Speaking" : participant.effectiveMuted ? "Muted" : "Listening";
                return (
                  <li
                    key={participant.playerId}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div>
                      <p className="font-semibold text-white">{isYou ? `${participant.displayName} (You)` : participant.displayName}</p>
                      <p className="text-xs text-slate-400">
                        {participant.isAutoMuted ? "Auto-muted" : participant.isMuted ? "Muted" : "Live"}
                      </p>
                    </div>
                    <span className={clsx("rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em]", badgeTone)}>
                      {badgeLabel}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              {voiceStatus === "idle"
                ? "Join the voice table to coordinate quick passes."
                : "Hold push-to-talk or unmute for an open mic."}
            </p>
            {voiceError ? <p className="text-xs text-rose-300">{voiceError}</p> : null}
            {infoMessage ? <p className="text-xs text-sky-200">{infoMessage}</p> : null}
          </div>

          <div className="space-y-3">
            {voiceStatus === "idle" ? (
              <button
                type="button"
                onClick={startVoice}
                disabled={!canJoin}
                className={clsx(
                  "w-full rounded-2xl px-5 py-3 text-sm font-semibold transition",
                  canJoin
                    ? "bg-gradient-to-r from-emerald-500 via-brand-500 to-sky-500 text-white shadow-glow hover:scale-[1.01] hover:brightness-110"
                    : "cursor-not-allowed border border-white/10 bg-white/5 text-slate-400",
                )}
              >
                {canJoin ? "Join Voice Chat" : "Voice Unavailable"}
              </button>
            ) : null}

            {voiceStatus === "starting" ? (
              <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm text-slate-300">
                Preparing microphone...
              </div>
            ) : null}

            {voiceStatus === "online" ? (
              <div className="space-y-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className={clsx(
                      "flex-1 rounded-2xl px-5 py-3 text-sm font-semibold transition",
                      manualMuted
                        ? "border border-white/10 bg-white/5 text-slate-200 hover:border-white/20"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-glow hover:brightness-110",
                    )}
                  >
                    {manualMuted ? "Unmute (Open Mic)" : "Mute"}
                  </button>
                  <button
                    type="button"
                    onClick={() => stopVoice("manual")}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-rose-400/40 hover:text-rose-200"
                  >
                    Leave
                  </button>
                </div>
                <button
                  type="button"
                  onMouseDown={handlePushStart}
                  onMouseUp={handlePushEnd}
                  onTouchStart={(event) => {
                    event.preventDefault();
                    handlePushStart();
                  }}
                  onTouchEnd={(event) => {
                    event.preventDefault();
                    handlePushEnd();
                  }}
                  className={clsx(
                    "relative w-full rounded-2xl border px-6 py-4 text-sm font-semibold uppercase tracking-[0.4em] transition",
                    pushActive
                      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200 shadow-glow"
                      : "border-white/10 bg-white/5 text-slate-200 hover:border-white/20",
                  )}
                >
                  {pushActive ? "Push to Talk — Live" : "Push to Talk"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {remoteAudioElements}
    </section>
  );
}

function updateParticipantList(list: VoiceParticipant[], update: VoiceParticipant): VoiceParticipant[] {
  const index = list.findIndex((participant) => participant.playerId === update.playerId);
  if (index === -1) {
    return [...list, update];
  }
  const clone = [...list];
  clone[index] = update;
  return clone;
}
