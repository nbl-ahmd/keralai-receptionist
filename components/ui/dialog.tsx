"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useModal } from "@/components/ui/use-modal";

export interface DialogContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Hide the title visually but keep it for screen readers. */
  hideTitle?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-3xl",
} as const;

/**
 * Centred modal dialog with focus trapping, Escape-to-close, scroll lock and
 * focus restoration. On phones it becomes a near-full-height sheet so it stays
 * usable with the on-screen keyboard.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  hideTitle,
  size = "md",
  className,
}: DialogContentProps) {
  const { containerRef, onKeyDown, close } = useModal(open, onOpenChange);
  const titleId = `dialog-title-${title.replace(/\s+/g, "-").toLowerCase()}`;
  const descId = description ? `${titleId}-desc` : undefined;

  // Avoid rendering the portal on the server.
  useEffect(() => {
    if (!open) return;
  }, [open]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-slate-950/50 animate-fade-in"
        onClick={close}
        aria-hidden
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-popover shadow-lg animate-sheet-in sm:rounded-2xl sm:animate-scale-in",
          SIZES[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className={cn("text-base font-semibold text-foreground", hideTitle && "sr-only")}>
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
            aria-label="Close dialog"
            className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-2 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Dialog;
