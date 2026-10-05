import { CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONES: Record<NoticeTone, { icon: typeof Info; classes: string }> = {
  info: { icon: Info, classes: "border-sky-200 bg-info-soft text-sky-900" },
  success: { icon: CheckCircle2, classes: "border-emerald-200 bg-success-soft text-emerald-900" },
  warning: { icon: TriangleAlert, classes: "border-amber-200 bg-warning-soft text-amber-900" },
  error: { icon: TriangleAlert, classes: "border-red-200 bg-destructive-soft text-red-900" },
};

/** Inline, non-blocking message used for validation and connection status. */
export function Notice({
  tone = "info",
  children,
  action,
  className,
}: {
  tone?: NoticeTone;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { icon: Icon, classes } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm", classes, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action}
    </div>
  );
}

export default Notice;
