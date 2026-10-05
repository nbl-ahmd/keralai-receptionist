import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Consistent empty / zero-data state. The icon is decorative; the title and
 * description carry the meaning for screen readers.
 */
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
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface-2/60 px-6 py-10 text-center",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border"
      >
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
