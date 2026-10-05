"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  message: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: { message: string; description?: string; tone?: ToastTone; duration?: number }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-slate-500" },
  success: { icon: CheckCircle2, className: "text-emerald-600" },
  warning: { icon: TriangleAlert, className: "text-amber-600" },
  error: { icon: TriangleAlert, className: "text-red-600" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef(new Map<string, number>());

  // Portals target document.body, which is absent during SSR. Rendering only
  // after mount keeps the server and first client render identical.
  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ message, description, tone = "info", duration = 4000 }) => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev.slice(-3), { id, message, description, tone }]);
      if (duration > 0) {
        timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:bottom-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+1rem)] sm:items-end"
            role="region"
            aria-label="Notifications"
          >
            {toasts.map((t) => {
              const { icon: Icon, className } = TONE_STYLES[t.tone];
              return (
                <div
                  key={t.id}
                  role="status"
                  aria-live="polite"
                  className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-popover p-3.5 shadow-lg animate-fade-up"
                >
                  <Icon className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", className)} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{t.message}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
