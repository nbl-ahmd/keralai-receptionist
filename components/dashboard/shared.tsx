import type { ReactNode } from "react";
import type { CallRecord } from "@/types";
import { cn } from "@/lib/utils";

export function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export const OUTCOME_LABELS: Record<CallRecord["outcome"], string> = {
  booked: "Booked",
  answered: "Answered",
  escalated: "Follow-up",
  missed: "Missed",
  abandoned: "Abandoned",
  "in-progress": "In progress",
};

/** Calm, low-saturation outcome treatments — never colour alone (each has a label). */
export const OUTCOME_STYLES: Record<CallRecord["outcome"], string> = {
  booked: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  answered: "bg-slate-100 text-slate-700 ring-slate-500/20",
  escalated: "bg-amber-50 text-amber-700 ring-amber-600/20",
  missed: "bg-red-50 text-red-700 ring-red-600/20",
  abandoned: "bg-slate-100 text-slate-500 ring-slate-500/20",
  "in-progress": "bg-sky-50 text-sky-700 ring-sky-600/20",
};

export function OutcomeBadge({
  outcome,
  className,
}: {
  outcome: CallRecord["outcome"];
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        OUTCOME_STYLES[outcome],
        className,
      )}
    >
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200/70">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
