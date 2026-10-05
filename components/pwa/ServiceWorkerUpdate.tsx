"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Registers the dashboard service worker and, critically, tells the user when a
 * new version is waiting so they are never stuck on a stale build.
 *
 * The worker only ever caches immutable build assets and icons (see
 * `public/sw.js`), so tenants never leak across caches. Update handling works by
 * watching `updatefound` → `statechange`, then prompting to reload; the reload
 * is deferred until the new worker calls `clients.claim()`.
 */
export function ServiceWorkerUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let registration: ServiceWorkerRegistration | undefined;

    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        setWaiting(worker);
      }
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          setWaiting(worker);
        }
      });
    };

    const register = async () => {
      try {
        registration = await navigator.serviceWorker.register("/sw.js");
        if (registration.waiting) setWaiting(registration.waiting);
        watch(registration.installing);
        registration.addEventListener("updatefound", () => watch(registration?.installing ?? null));
      } catch {
        // Registration failures must never break the app.
      }
    };

    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", register, { once: true });

    // Check for updates when the tab regains focus, so long-lived sessions pick
    // up new deploys without a hard refresh.
    const onVisible = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting || dismissed || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[110] flex items-center gap-3 rounded-xl border border-border bg-popover p-3 shadow-lg animate-fade-up sm:inset-x-auto sm:left-4 sm:w-96"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">A new version is ready</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Reload to get the latest improvements.</p>
      </div>
      <Button
        size="sm"
        className="gap-1.5"
        onClick={() => {
          reloadingRef.current = true;
          waiting.postMessage({ type: "SKIP_WAITING" });
          // Fallback if the worker doesn't trigger controllerchange promptly.
          window.setTimeout(() => window.location.reload(), 800);
        }}
      >
        <RefreshCw className="h-3.5 w-3.5" /> Reload
      </Button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notice"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-3 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>,
    document.body,
  );
}

export default ServiceWorkerUpdate;
