"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarCheck,
  Headset,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { CompanyProfile } from "../types";
import { useLiveSession } from "../lib/use-live-session";
import { buildGreeting } from "../lib/maya-config";
import { cn } from "../lib/utils";

export type DemoAgentId = "reception" | "cart-recovery" | "appointment";

export interface DemoAgent {
  id: DemoAgentId;
  name: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Opening line. When omitted, the profile-based greeting is used. */
  greeting?: string;
  sampleQuestions: string[];
}

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: "reception",
    name: "Receptionist",
    blurb: "Answers questions about your business and books appointments.",
    icon: Headset,
    sampleQuestions: [
      "What services do you offer?",
      "How much does it cost?",
      "Can I book a call tomorrow?",
    ],
  },
  {
    id: "cart-recovery",
    name: "Cart Recovery Nudge",
    blurb: "Follows up on abandoned carts with offers and EMI options.",
    icon: ShoppingCart,
    greeting: "Hi! I noticed you left something in your cart — can I help you finish up?",
    sampleQuestions: [
      "Is there any discount?",
      "Do you offer EMI?",
      "What is the return policy?",
    ],
  },
  {
    id: "appointment",
    name: "Appointment Booking",
    blurb: "Qualifies callers and schedules them without a human.",
    icon: CalendarCheck,
    greeting: "Thanks for calling. Would you like to book an appointment?",
    sampleQuestions: [
      "What slots are available?",
      "Can we meet this week?",
      "Where are you located?",
    ],
  },
];

interface AgentDemoProps {
  agents?: DemoAgent[];
  defaultAgentId?: DemoAgentId;
  className?: string;
  /** Profile used for grounding. Falls back to a neutral demo identity. */
  companyProfile?: CompanyProfile;
  onBuildAgent?: () => void;
}

const DEMO_PROFILE: CompanyProfile = {
  name: "KeralAI",
  industry: "AI voice agents",
  description: "Voice AI agents for support, sales, and appointment booking.",
  address: "Kerala, India",
  contactPhone: "",
  contactEmail: "",
};

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function AgentDemo({
  agents = DEMO_AGENTS,
  defaultAgentId = "reception",
  className,
  companyProfile,
  onBuildAgent,
}: AgentDemoProps) {
  const [activeAgentId, setActiveAgentId] = useState<DemoAgentId>(defaultAgentId);
  const [elapsed, setElapsed] = useState(0);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId) ?? agents[0],
    [agents, activeAgentId],
  );

  const profile = useMemo<CompanyProfile>(
    () => ({
      ...(companyProfile && companyProfile.name ? companyProfile : DEMO_PROFILE),
      // The greeting is injected by the agent persona below.
    }),
    [companyProfile],
  );

  const { isConnected, isMuted, volume, error, transcript, connect, disconnect, toggleMute } =
    useLiveSession({
      companyProfile: profile,
      report: false, // keep demo traffic out of real analytics
      greeting: activeAgent.greeting,
      onBookAppointment: () => undefined,
    });

  const openingLine = activeAgent.greeting ?? buildGreeting(profile);

  // Session timer
  useEffect(() => {
    if (!isConnected) {
      setElapsed(0);
      return;
    }
    const interval = window.setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isConnected]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Disconnect when switching agents mid-call
  useEffect(() => {
    if (isConnected) void disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentId]);

  const orbScale = 1 + Math.min(volume / 40, 0.28);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.45)]",
        className,
      )}
    >
      <div className="grid lg:grid-cols-[260px_1fr_360px]">
        {/* Agent picker */}
        <aside className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
          <p className="text-sm font-semibold text-slate-900">Choose an agent</p>
          <div className="mt-4 space-y-2">
            {agents.map((agent) => {
              const Icon = agent.icon;
              const active = agent.id === activeAgentId;
              return (
                <button
                  key={agent.id}
                  onClick={() => setActiveAgentId(agent.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all",
                    active ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-emerald-600" : "text-slate-400")} />
                  <span className={cn("flex-1 text-sm font-semibold", active ? "text-emerald-800" : "text-slate-600")}>
                    {agent.name}
                  </span>
                  {active && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Try asking</p>
            <ul className="mt-2 space-y-1.5">
              {activeAgent.sampleQuestions.map((question) => (
                <li key={question} className="text-xs leading-relaxed text-slate-600">
                  &ldquo;{question}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Orb */}
        <div className="relative flex flex-col items-center justify-center gap-6 bg-slate-50/60 px-6 py-10">
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">{activeAgent.name}</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">{activeAgent.blurb}</p>
          </div>

          <div className="relative flex h-56 w-56 items-center justify-center">
            <div
              className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-300 via-emerald-400 to-teal-500 blur-2xl transition-transform duration-300"
              style={{ transform: `scale(${isConnected ? orbScale : 0.9})`, opacity: isConnected ? 0.55 : 0.3 }}
            />
            <div
              className={cn(
                "relative flex h-44 w-44 items-center justify-center rounded-full bg-gradient-to-br from-emerald-200 to-emerald-400 shadow-2xl transition-transform duration-300",
                isConnected && "animate-pulse",
              )}
              style={{ transform: `scale(${isConnected ? orbScale : 1})` }}
            >
              {!isConnected ? (
                <button
                  onClick={() => void connect()}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg transition hover:scale-105"
                  aria-label="Start demo call"
                >
                  <Phone className="h-7 w-7 text-emerald-600" />
                </button>
              ) : (
                <button
                  onClick={toggleMute}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg transition hover:scale-105"
                  aria-label={isMuted ? "Resume" : "Pause"}
                >
                  {isMuted ? <Play className="h-7 w-7 text-emerald-600" /> : <Pause className="h-7 w-7 text-emerald-600" />}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span className="tabular-nums">{isConnected ? formatTimer(elapsed) : "00:00"}</span>
            <span className="h-3 w-px bg-slate-300" />
            <span>{isMuted ? "Paused" : isConnected ? "Listening" : "Ready"}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {isConnected ? (
              <button
                onClick={() => void disconnect()}
                className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-red-600"
              >
                <PhoneOff className="h-4 w-4" /> End demo
              </button>
            ) : (
              <button
                onClick={() => void connect()}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-slate-800"
              >
                <Mic className="h-4 w-4" /> Start voice demo
              </button>
            )}
            {isConnected && (
              <button
                onClick={toggleMute}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {isMuted ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                {isMuted ? "Resume" : "Pause"}
              </button>
            )}
          </div>

          {error && <p className="max-w-xs text-center text-xs text-red-600">{error}</p>}
        </div>

        {/* Transcript */}
        <div className="flex flex-col border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Live transcript</p>
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Mic className="h-3.5 w-3.5" /> {isConnected ? "Maya" : "Offline"}
            </span>
          </div>

          <div className="mt-4 h-[340px] flex-1 space-y-3 overflow-y-auto pr-1">
            {transcript.length === 0 && (
              <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
                {isConnected
                  ? `Maya is greeting you: “${openingLine}”`
                  : "Start the demo and speak naturally. The transcript appears here in real time."}
              </div>
            )}
            {transcript.map((turn, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  turn.role === "caller"
                    ? "bg-emerald-100 text-emerald-900"
                    : "ml-auto bg-slate-100 text-slate-800",
                )}
              >
                {turn.text}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>

          {onBuildAgent && (
            <button
              onClick={onBuildAgent}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <Sparkles className="h-4 w-4" /> Build your own agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
