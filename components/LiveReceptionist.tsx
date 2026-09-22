"use client";

import React, { useState } from "react";
import { Mic, MicOff, Phone, PhoneOff, Radio, Settings, Sliders, Volume2, X } from "lucide-react";
import { Appointment, CompanyProfile, TranscriptTurn } from "../types";
import { VOICE_OPTIONS, useLiveSession } from "../lib/use-live-session";
import { cn } from "../lib/utils";

interface LiveReceptionistProps {
  companyProfile: CompanyProfile;
  onBookAppointment: (apt: Appointment) => void;
  /** Optional: trigger auto-connect on mount (used by the dashboard). */
  autoConnect?: boolean;
  /** Optional: callback to reset auto-connect flag after it fires. */
  onAutoConnectHandled?: () => void;
}

const LiveReceptionist: React.FC<LiveReceptionistProps> = ({
  companyProfile,
  onBookAppointment,
  autoConnect,
  onAutoConnectHandled,
}) => {
  const [voiceName, setVoiceName] = useState("Aoede");
  const [pitch, setPitch] = useState("Normal");
  const [speed, setSpeed] = useState("Normal");
  const [showSettings, setShowSettings] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const autoConnectHandledRef = React.useRef(false);

  const {
    isConnected,
    isMuted,
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

  const renderSettings = () => (
    <div className="absolute inset-0 z-20 flex flex-col bg-white animate-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-center justify-between border-b border-slate-100 p-6">
        <h3 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Sliders className="h-5 w-5 text-emerald-600" />
          Voice Settings
        </h3>
        <button
          onClick={() => setShowSettings(false)}
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-8 overflow-y-auto p-6">
        <div>
          <label className="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Select Voice Persona
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {VOICE_OPTIONS.map((voice) => (
              <button
                key={voice.id}
                onClick={() => setVoiceName(voice.id)}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all",
                  voiceName === voice.id
                    ? "border-emerald-500 bg-emerald-50/50"
                    : "border-slate-100 hover:border-emerald-200 hover:bg-slate-50",
                )}
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
                    voiceName === voice.id
                      ? "bg-emerald-200 text-emerald-800"
                      : "bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600",
                  )}
                >
                  <Radio className={cn("h-5 w-5", voiceName === voice.id && "fill-current")} />
                </div>
                <div>
                  <div className="font-bold text-slate-900">{voice.label}</div>
                  <div className="mt-0.5 text-xs font-medium text-slate-500">
                    {voice.gender} • {voice.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-400">Pitch</label>
          <div className="flex rounded-xl bg-slate-100 p-1.5">
            {["Low", "Normal", "High"].map((option) => (
              <button
                key={option}
                onClick={() => setPitch(option)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all",
                  pitch === option ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-4 block text-xs font-bold uppercase tracking-wider text-slate-400">
            Speaking Speed
          </label>
          <div className="flex rounded-xl bg-slate-100 p-1.5">
            {["Slow", "Normal", "Fast"].map((option) => (
              <button
                key={option}
                onClick={() => setSpeed(option)}
                className={cn(
                  "flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all",
                  speed === option ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50 p-6">
        <button
          onClick={() => setShowSettings(false)}
          className="w-full rounded-xl bg-emerald-600 py-4 font-bold text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700 active:scale-[0.98]"
        >
          Apply Settings
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col animate-in fade-in duration-500">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 md:p-8">
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/80 px-8 py-5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className={cn("h-2.5 w-2.5 rounded-full", isConnected ? "animate-pulse bg-emerald-500" : "bg-red-500")} />
              <span className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {isConnected ? "Live Session Active" : "Offline"}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden text-xs font-bold tracking-widest text-slate-400 sm:block">
                GEMINI 2.5 MULTIMODAL
              </div>
              {!isConnected && (
                <button
                  onClick={() => setShowSettings((prev) => !prev)}
                  className="rounded-full p-2.5 text-slate-600 transition-colors hover:bg-slate-100"
                  title="Voice Settings"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          <div className="relative flex flex-1 items-center justify-center bg-slate-50">
            {showSettings && renderSettings()}

            {!showSettings && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                {!isConnected ? (
                  <div className="text-center animate-in zoom-in duration-300">
                    <div className="relative mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-50 shadow-inner">
                      <div className="absolute inset-0 rounded-full border border-emerald-200 opacity-50" />
                      <Phone className="h-12 w-12 text-emerald-600" />
                    </div>
                    <h3 className="mb-3 text-2xl font-bold text-slate-900">Start Live Receptionist</h3>
                    <p className="mx-auto mb-8 max-w-md text-lg text-slate-500">
                      Connect to Maya to handle customer queries and bookings for{" "}
                      <span className="font-semibold text-slate-800">
                        {companyProfile.name || "your business"}
                      </span>
                      .
                    </p>
                    <div className="flex flex-wrap justify-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                        <Volume2 className="h-3 w-3" /> {voiceName}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                        {pitch} Pitch
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
                        {speed} Speed
                      </span>
                    </div>
                  </div>
                ) : (
                  <canvas ref={canvasRef} width={800} height={400} className="h-full w-full object-cover opacity-80" />
                )}

                {isConnected && (
                  <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300">
                    <div
                      className={cn(
                        "rounded-full bg-white/30 p-2 backdrop-blur-sm transition-all duration-100",
                        volume > 10 ? "scale-110 shadow-2xl shadow-emerald-400/40" : "scale-100 shadow-xl",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${voiceName}&backgroundColor=10b981`}
                        alt="AI Avatar"
                        className="h-32 w-32 rounded-full bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live transcript */}
          {isConnected && (
            <div className="border-t border-slate-100 bg-white px-6 py-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Live transcript</p>
              <div className="h-28 space-y-2 overflow-y-auto pr-1">
                {transcript.length === 0 && (
                  <p className="text-sm text-slate-400">Listening… the transcript will appear here.</p>
                )}
                {transcript.map((turn, index) => (
                  <div
                    key={index}
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                      turn.role === "caller" ? "bg-slate-100 text-slate-800" : "ml-auto bg-emerald-100 text-emerald-900",
                    )}
                  >
                    {turn.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="relative z-20 flex items-center justify-center gap-8 border-t border-slate-100 bg-white p-8">
            {!isConnected ? (
              <button
                onClick={() => {
                  setShowSettings(false);
                  void connect();
                }}
                disabled={showSettings}
                className="flex items-center gap-3 rounded-2xl bg-emerald-600 px-10 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-200 transition-all hover:-translate-y-1 hover:bg-emerald-700 hover:shadow-emerald-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Phone className="h-6 w-6" /> Connect Line
              </button>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  className={cn(
                    "rounded-full p-6 transition-all duration-200",
                    isMuted
                      ? "bg-red-50 text-red-500 ring-2 ring-red-100 hover:bg-red-100"
                      : "bg-slate-100 text-slate-700 ring-2 ring-transparent hover:bg-slate-200",
                  )}
                >
                  {isMuted ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                </button>

                <button
                  onClick={() => void disconnect()}
                  className="flex items-center gap-3 rounded-2xl bg-red-500 px-10 py-4 text-lg font-bold text-white shadow-lg shadow-red-200 transition-all hover:-translate-y-1 hover:bg-red-600 hover:shadow-red-300 active:scale-[0.98]"
                >
                  <PhoneOff className="h-6 w-6" /> End Session
                </button>
              </>
            )}
          </div>

          {error && <div className="px-8 pb-6 text-sm text-red-700">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default LiveReceptionist;
