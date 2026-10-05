"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useModal } from "@/components/ui/use-modal";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** `bottom` slides up from the bottom (mobile detail); `right` is a drawer. */
  side?: "bottom" | "right";
  className?: string;
}

/**
 * Responsive sheet: bottom sheet on phones, side drawer on larger screens when
 * `side="right"`. Same Modal behaviour as `Dialog` (focus trap, Esc, scroll lock).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = "right",
  className,
}: SheetProps) {
  const { containerRef, onKeyDown, close } = useModal(open, onOpenChange);
  const titleId = `sheet-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const descId = description ? `${titleId}-desc` : undefined;

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex">
      <div className="absolute inset-0 bg-slate-950/50 animate-fade-in" onClick={close} aria-hidden />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "relative ml-auto flex w-full flex-col overflow-hidden bg-popover shadow-lg",
          side === "right"
            ? "max-w-md animate-sheet-in-right sm:border-l sm:border-border"
            : "mt-auto max-h-[88dvh] rounded-t-3xl border border-border sm:ml-auto sm:mt-0 sm:max-h-none sm:rounded-none sm:rounded-l-3xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-foreground">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close panel"
            className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="border-t border-border bg-surface-2 px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Sheet;
