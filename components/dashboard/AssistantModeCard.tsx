"use client";

import { useMemo, useState } from "react";
import {
  BellOff,
  CalendarClock,
  Car,
  CheckCircle2,
  Moon,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusIndicator } from "@/components/ui/status-indicator";
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

/**
 * Quick-control surface for the tenant's assistant runtime mode. The mode is
 * applied to new calls until it is cleared or expires.
 */
export function AssistantModeCard({ mode }: { mode: AssistantModeState }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customInstruction, setCustomInstruction] = useState("");
  const [customExpiry, setCustomExpiry] = useState<string>("none");

  const status = mode.status;
  const active = Boolean(status && status.mode !== "available" && !status.expired);
  const expiryText = active && status?.expiresAt ? formatExpiry(status.expiresAt) : null;

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
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 font-display">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Assistant status
          </CardTitle>
          <CardDescription className="mt-1">
            Set what your assistant should say about your availability on new calls.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusIndicator
            tone={active ? "warning" : "online"}
            label={status?.label ?? "Available"}
            pulse={active}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {mode.error && <Notice tone="error">{mode.error}</Notice>}

        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {QUICK_MODES.map((item) => {
              const isActive = item.id === "available" ? !active : status?.mode === item.id && !status?.expired;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={mode.busy}
                  onClick={() => (item.id === "available" ? mode.clearMode() : mode.setMode(item.id))}
                  aria-pressed={isActive}
                  className={cn(
                    "flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    isActive
                      ? "border-primary/30 bg-primary-soft text-primary-soft-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {expiryText ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Active until {expiryText}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {active ? "Active with no expiry." : "Callers are told you are reachable."}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowCustom((open) => !open)}
            className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-primary-soft-foreground transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {showCustom ? "Hide custom mode" : "Custom mode"}
          </button>
        </div>

        {showCustom && (
          <div className="space-y-4 rounded-2xl border border-border bg-surface-2 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status label">
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    value={customLabel}
                    onChange={(event) => setCustomLabel(event.target.value)}
                    placeholder="e.g. At the clinic"
                    maxLength={120}
                    {...aria}
                  />
                )}
              </Field>
              <Field label="Ends">
                {({ id }) => (
                  <Select value={customExpiry} onValueChange={setCustomExpiry}>
                    <SelectTrigger id={id} aria-label="Custom mode expiry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>
            <Field label="What should the assistant say?">
              {({ id, ...aria }) => (
                <Textarea
                  id={id}
                  value={customInstruction}
                  onChange={(event) => setCustomInstruction(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="resize-none"
                  placeholder="I'm at the clinic this afternoon and will call back after 5."
                  {...aria}
                />
              )}
            </Field>
            <Button
              onClick={applyCustom}
              disabled={mode.busy || (!customLabel.trim() && !customInstruction.trim())}
              loading={mode.busy}
              className="w-full gap-2 sm:w-auto"
            >
              Apply custom mode
            </Button>
          </div>
        )}

        {builtIns.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {builtIns.map((definition) => (
              <button
                key={definition.id}
                type="button"
                disabled={mode.busy}
                onClick={() => mode.setMode(definition.id)}
                className="inline-flex min-h-[44px] items-center rounded-full border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary-soft-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                title={definition.instruction}
              >
                {definition.label}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AssistantModeCard;
