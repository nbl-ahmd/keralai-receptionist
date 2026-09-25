"use client";

import { useMemo, useState } from "react";
import {
  BellOff,
  CalendarClock,
  Car,
  CheckCircle2,
  Loader2,
  Moon,
  Sparkles,
  Target,
  TriangleAlert,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AssistantModeState } from "@/lib/use-assistant-mode";

const QUICK_MODES = [
  { id: "available", label: "Available", icon: CheckCircle2 },
  { id: "meeting", label: "Meeting", icon: Users },
  { id: "driving", label: "Driving", icon: Car },
  { id: "sleeping", label: "Sleep", icon: Moon },
  { id: "focus", label: "Focus", icon: Target },
  { id: "do_not_disturb", label: "DND", icon: BellOff },
] as const;

const EXPIRY_OPTIONS = [
  { value: "none", label: "No expiry" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "240", label: "4 hours" },
  { value: "480", label: "8 hours" },
] as const;

function expiryToIso(choice: string): string | null {
  if (choice === "none") return null;
  const minutes = Number(choice);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AssistantModeCard({ mode }: { mode: AssistantModeState }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");
  const [customExpiry, setCustomExpiry] = useState<string>("none");

  const status = mode.status;
  const active = Boolean(status && status.mode !== "available");
  const expiryText = status?.expiresAt ? formatExpiry(status.expiresAt) : null;

  const builtIns = useMemo(
    () => (mode.data?.modes ?? []).filter((definition) => definition.id !== "custom"),
    [mode.data],
  );

  const applyCustom = async () => {
    const ok = await mode.setMode("custom", {
      label: customLabel.trim() || "Custom",
      instruction: customInstruction.trim() || undefined,
      expiresAt: expiryToIso(customExpiry),
    });
    if (ok) {
      setShowCustom(false);
      setCustomLabel("");
      setCustomInstruction("");
      setCustomExpiry("none");
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" /> Assistant status
          </CardTitle>
          <CardDescription>
            Set what your assistant should say about your availability on new calls.
          </CardDescription>
        </div>
        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold",
            active ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700",
          )}
        >
          <span
            className={cn("h-2 w-2 rounded-full", active ? "bg-amber-500" : "bg-emerald-500")}
            aria-hidden
          />
          {status?.label ?? "Available"}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {mode.error && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{mode.error}</span>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Quick actions</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {QUICK_MODES.map((item) => {
              const isActive =
                item.id === "available"
                  ? !active
                  : status?.mode === item.id && !status?.expired;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={mode.busy}
                  onClick={() => (item.id === "available" ? mode.clearMode() : mode.setMode(item.id))}
                  aria-pressed={isActive}
                  className={cn(
                    "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:opacity-60",
                    isActive
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {expiryText && active ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" /> Active until {expiryText}
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              {active ? "Active with no expiry." : "Callers are told you are reachable."}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowCustom((open) => !open)}
            className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {showCustom ? "Hide custom mode" : "Custom mode"}
          </button>
        </div>

        {showCustom && (
          <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="custom-label" className="text-xs font-medium text-slate-600">
                  Status label
                </label>
                <Input
                  id="custom-label"
                  value={customLabel}
                  onChange={(event) => setCustomLabel(event.target.value)}
                  placeholder="e.g. At the clinic"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="custom-expiry" className="text-xs font-medium text-slate-600">
                  Ends
                </label>
                <select
                  id="custom-expiry"
                  value={customExpiry}
                  onChange={(event) => setCustomExpiry(event.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="custom-instruction" className="text-xs font-medium text-slate-600">
                What should the assistant say?
              </label>
              <Textarea
                id="custom-instruction"
                value={customInstruction}
                onChange={(event) => setCustomInstruction(event.target.value)}
                rows={3}
                maxLength={2000}
                className="resize-none"
                placeholder="I'm at the clinic this afternoon and will call back after 5."
              />
            </div>
            <Button
              onClick={applyCustom}
              disabled={mode.busy || (!customLabel.trim() && !customInstruction.trim())}
              className="gap-2"
            >
              {mode.busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply custom mode
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {builtIns.map((definition) => (
            <button
              key={definition.id}
              type="button"
              disabled={mode.busy}
              onClick={() => mode.setMode(definition.id)}
              className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-emerald-200 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-60"
              title={definition.instruction}
            >
              {definition.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default AssistantModeCard;