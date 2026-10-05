import type { CallRecord } from "@/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";

export { EmptyState } from "@/components/ui/empty-state";
export { Skeleton, SkeletonRows } from "@/components/ui/skeleton";

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

export function formatFullDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

/** Semantic badge variant per outcome — the label always states the outcome. */
export const OUTCOME_VARIANTS: Record<CallRecord["outcome"], BadgeProps["variant"]> = {
  booked: "success",
  answered: "secondary",
  escalated: "warning",
  missed: "danger",
  abandoned: "outline",
  "in-progress": "info",
};

/** @deprecated prefer OutcomeBadge; retained for any lingering class-based use. */
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
    <Badge variant={OUTCOME_VARIANTS[outcome]} className={className}>
      {OUTCOME_LABELS[outcome]}
    </Badge>
  );
}
