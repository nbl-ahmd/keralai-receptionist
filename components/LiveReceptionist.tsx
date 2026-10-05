"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Radio,
  RefreshCw,
  Settings2,
  Sparkles,
  Volume2,
} from "lucide-react";

import { Appointment, CompanyProfile, TranscriptTurn } from "../types";
import { VOICE_OPTIONS, useLiveSession } from "../lib/use-live-session";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Notice } from "./ui/notice";
import { Segmented } from "./ui/segmented";
import { StatusIndicator, type StatusTone } from "./ui/status-indicator";

interface LiveReceptionistProps {
  companyProfile: CompanyProfile;
  onBookAppointment: (apt: Appointment) => void;
  /** Optional: trigger auto-connect on mount (used by the dashboard). */
  autoConnect?: boolean;
  /** Optional: callback to reset auto-connect flag after it fires. */
  onAutoConnectHandled?: () => void;
  /** Initial voice preferences, usually sourced from the saved assistant profile. */
  initialVoiceName?: string;
  initialPitch?: string;
  initialSpeed?: string;
}

type VoicePhase =
  | "idle"
  | "connecting"
  | "reconnecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "failed";

interface PhaseMeta {
  label: string;
  helper: string;
  tone: StatusTone;
  ring: string;
  orb: string;
}

const PHASE_META: Record<VoicePhase, PhaseMeta> = {
  idle: {
    label: "Ready",
    helper: "Start a session to talk to your assistant the way a caller would.",
    tone: "neutral",
    ring: "border-border",
    orb: "from-slate-100 to-slate-50 text-slate-500",
  },
  connecting: {
    label: "Connecting…",
    helper: "Authorising your workspace and opening the audio channel.",
    tone: "warning",
    ring: "border-amber-200",
    orb: "from-amber-100 to-amber-50 text-amber-600",
  },
  reconnecting: {
    label: "Reconnecting…",
    helper: "The connection dropped. Trying to reach the voice relay again.",
    tone: "warning",
    ring: "border-amber-200",
    orb: "from-amber-100 to-amber-50 text-amber-600",
  },
  listening: {
    label: "Listening",
    helper: "Speak naturally — the assistant is listening.",
    tone: "online",
    ring: "border-emerald-200",
    orb: "from-emerald-100 to-teal-50 text-emerald-600",
  },
  thinking: {
    label: "Thinking…",
    helper: "Working out the best reply.",
    tone: "warning",
    ring: "border-sky-200",
    orb: "from-sky-100 to-sky-50 text-sky-600",
  },
  speaking: {
    label: "Assistant speaking",
    helper: "You can interrupt at any time — just start talking.",
    tone: "online",
    ring: "border-emerald-300",
    orb: "from-emerald-200 to-teal-100 text-emerald-700",
  },
  interrupted: {
    label: "Interrupted",
    helper: "Go ahead — the assistant is listening to you now.",
    tone: "warning",
    ring: "border-amber-200",
    orb: "from-amber-100 to-amber-50 text-amber-600",
  },
  failed: {
    label: "Connection problem",
    helper: "The voice session could not continue.",
    tone: "error",
    ring: "border-red-200",
    orb: "from-red-100 to-red-50 text-red-600",
  },
};

const PITCH_OPTIONS = [
  { value: "Low", label: "Low" },
  { value: "Normal", label: "Normal" },
  { value: "High", label: "High" },
];
const SPEED_OPTIONS = [
  { value: "Slow", label: "Slow" },
  { value: "Normal", label: "Normal" },
  { value: "Fast", label: "Fast" },
];

const LiveReceptionist: React.FC<LiveReceptionistProps> = ({
  companyProfile,
  onBookAppointment,
  autoConnect,
  onAutoConnectHandled,
  initialVoiceName,
  initialPitch,
  initialSpeed,
}) => {
  const [voiceName, setVoiceName] = useState(initialVoiceName || "Aoede");
  const [pitch, setPitch] = useState(initialPitch || "Normal");
  const [speed, setSpeed] = useState(initialSpeed || "Normal");
  const [showSettings, setShowSettings] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [micPermission, setMicPermission] = useState<PermissionState | "unknown">("unknown");
  const [showInterrupted, setShowInterrupted] = useState(false);
  const autoConnectHandledRef = React.useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const {
    isConnected,
    isConnecting,
    hasConnected,
    isMuted,
    isSpeaking,
    lastInterruptedAt,
    volume,
    error,
    canvasRef,
    connect,
    disconnect,
    toggleMute,
  } = useLiveSession({
    companyProfile,
    onBookAppointment,
    onTranscript: setTranscript,
    voiceName,
    pitch,
    speed,
  });

  React.useEffect(() => {
    if (autoConnect && !autoConnectHandledRef.current) {
      autoConnectHandledRef.current = true;
      onAutoConnectHandled?.();
      void connect();
    }
  }, [autoConnect, connect, onAutoConnectHandled]);

  // Surface microphone permission so we can explain failures before they happen.
  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | undefined;
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => {
          if (cancelled) return;
          status = result;
          setMicPermission(result.state);
          result.onchange = () => setMicPermission(result.state);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, []);

  // Barge-in indicator is intentionally transient.
  useEffect(() => {
    if (!lastInterruptedAt) return;
    setShowInterrupted(true);
    const timer = window.setTimeout(() => setShowInterrupted(false), 1400);
    return () => window.clearTimeout(timer);
  }, [lastInterruptedAt]);

  const lastTurn = transcript[transcript.length - 1];
  const phase: VoicePhase = useMemo(() => {
    if (error) return "failed";
    if (showInterrupted) return "interrupted";
    if (isConnecting) return hasConnected ? "reconnecting" : "connecting";
    if (isConnected) {
      if (isSpeaking) return "speaking";
      if (lastTurn?.role === "caller") return "thinking";
      return "listening";
    }
    if (hasConnected) return "reconnecting";
    return "idle";
  }, [error, showInterrupted, isConnecting, hasConnected, isConnected, isSpeaking, lastTurn]);

  const meta = PHASE_META[phase];
  const active = isConnected;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const micLabel =
    micPermission === "denied"
      ? "Microphone blocked"
      : micPermission === "granted"
        ? "Microphone ready"
        : "Microphone permission needed";

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur sm:px-6 sm:pt-3.5">
        <StatusIndicator tone={meta.tone} label={meta.label} pulse={active} />
        <div className="flex items-center gap-2">
          <span className="hidden text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:block">
            KeralAI assistant
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowSettings(true)}
            disabled={active}
            aria-label="Voice settings"
            title="Voice settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-surface-2 px-4 py-6">
        {active ? (
          <canvas
            ref={canvasRef}
            width={800}
            height={400}
            aria-hidden
            className="absolute inset-0 h-full w-full opacity-70"
          />
        ) : null}

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="relative mb-6 flex h-32 w-32 items-center justify-center sm:h-40 sm:w-40">
            {active && (
              <span
                aria-hidden
                className={cn(
                  "absolute inset-0 rounded-full border-2 opacity-60",
                  meta.ring,
                  phase === "speaking" && "animate-pulse-ring",
                )}
              />
            )}
            <div
              aria-hidden
              className={cn(
                "flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br shadow-md transition-transform duration-150 sm:h-28 sm:w-28",
                meta.orb,
                active && volume > 8 && "scale-110",
              )}
            >
              {phase === "failed" ? (
                <AlertTriangle className="h-9 w-9" />
              ) : phase === "connecting" || phase === "reconnecting" ? (
                <Loader2 className="h-9 w-9 animate-spin" />
              ) : phase === "speaking" ? (
                <Volume2 className="h-9 w-9" />
              ) : isMuted ? (
                <MicOff className="h-9 w-9" />
              ) : active ? (
                <Mic className="h-9 w-9" />
              ) : (
                <Phone className="h-9 w-9" />
              )}
            </div>
          </div>

          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {phase === "idle" ? "Start a live session" : meta.label}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {phase === "idle" && companyProfile.name
              ? `Talk to your assistant the way a caller would for ${companyProfile.name}. It answers, takes messages, and can book time.`
              : phase === "failed" && error
                ? error
                : meta.helper}
          </p>

          {!active && (
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 shadow-xs">
                <Volume2 className="h-3 w-3" aria-hidden /> {voiceName}
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1.5 shadow-xs">{pitch} pitch</span>
              <span className="rounded-full border border-border bg-card px-3 py-1.5 shadow-xs">{speed} speed</span>
            </div>
          )}
        </div>
      </div>

      {/* Inline status notices */}
      {(error || micPermission === "denied") && (
        <div className="border-t border-border px-4 py-3 sm:px-6">
          {error ? (
            <Notice tone="error">{error}</Notice>
          ) : (
            <Notice tone="warning">
              Microphone access is blocked. Enable it in your browser settings, then reconnect.
            </Notice>
          )}
        </div>
      )}

      {/* Transcript */}
      {active && (
        <div className="border-t border-border bg-card px-4 py-3 sm:px-6">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Live transcript</p>
          <div
            className="h-24 space-y-2 overflow-y-auto pr-1 sm:h-28"
            role="log"
            aria-live="polite"
            aria-label="Live transcript"
          >
            {transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground">Listening… the transcript will appear here.</p>
            ) : (
              transcript.map((turn, index) => (
                <div
                  key={index}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    turn.role === "caller"
                      ? "bg-surface-3 text-foreground"
                      : "ml-auto bg-primary-soft text-primary-soft-foreground",
                  )}
                >
                  {turn.text}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      )}

      {/* Controls — thumb-reachable on phones */}
      <div className="flex items-center justify-center gap-3 border-t border-border bg-card px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:gap-6 sm:px-6 sm:py-5">
        {!active ? (
          <Button
            size="lg"
            className="w-full max-w-xs gap-2.5"
            onClick={() => void connect()}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : phase === "failed" || hasConnected ? (
              <RefreshCw className="h-5 w-5" />
            ) : (
              <Phone className="h-5 w-5" />
            )}
            {isConnecting ? "Connecting…" : hasConnected ? "Reconnect" : "Start session"}
          </Button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={isMuted}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isMuted
                  ? "bg-destructive-soft text-red-600 ring-2 ring-red-200"
                  : "bg-surface-3 text-foreground hover:bg-slate-200",
              )}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>

            <button
              type="button"
              onClick={() => void disconnect()}
              className="flex h-14 items-center gap-2.5 rounded-full bg-destructive px-7 text-base font-semibold text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <PhoneOff className="h-5 w-5" /> End session
            </button>
          </>
        )}
      </div>

      {/* Voice settings */}
      <Dialog
        open={showSettings}
        onOpenChange={setShowSettings}
        title="Voice settings"
        description="Choose how your assistant sounds for this session."
      >
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Voice persona
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {VOICE_OPTIONS.map((voice) => {
                const selected = voiceName === voice.id;
                return (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => setVoiceName(voice.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary/40 bg-primary-soft/60"
                        : "border-border bg-card hover:bg-surface-2",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        selected ? "bg-primary/15 text-primary" : "bg-surface-3 text-slate-500",
                      )}
                    >
                      <Radio className={cn("h-4 w-4", selected && "fill-current")} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{voice.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {voice.gender} · {voice.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Pitch</p>
              <Segmented value={pitch} onValueChange={setPitch} options={PITCH_OPTIONS} aria-label="Voice pitch" />
            </div>
            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Speed</p>
              <Segmented value={speed} onValueChange={setSpeed} options={SPEED_OPTIONS} aria-label="Speaking speed" />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-xs text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {micLabel}. Settings apply the next time you
            connect.
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default LiveReceptionist;
