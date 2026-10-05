import { cn } from "@/lib/utils";

export type StatusTone = "online" | "active" | "warning" | "offline" | "error" | "neutral";

const TONE_DOT: Record<StatusTone, string> = {
  online: "bg-emerald-500",
  active: "bg-emerald-500",
  warning: "bg-amber-500",
  offline: "bg-slate-300",
  error: "bg-red-500",
  neutral: "bg-slate-400",
};

const TONE_TEXT: Record<StatusTone, string> = {
  online: "text-emerald-700",
  active: "text-emerald-700",
  warning: "text-amber-700",
  offline: "text-muted-foreground",
  error: "text-red-700",
  neutral: "text-muted-foreground",
};

/**
 * Colour is always paired with a text label so status is never conveyed by
 * colour alone. The dot is decorative; the label is the accessible content.
 */
export function StatusIndicator({
  tone,
  label,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  label: string;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", TONE_TEXT[tone], className)}>
      <span className="relative flex h-2 w-2" aria-hidden>
        {pulse && (
          <span className={cn("absolute inline-flex h-full w-full animate-pulse-ring rounded-full", TONE_DOT[tone])} />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", TONE_DOT[tone])} />
      </span>
      {label}
    </span>
  );
}

export default StatusIndicator;
