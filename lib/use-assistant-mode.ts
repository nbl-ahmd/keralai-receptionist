"use client";

/**
 * lib/use-assistant-mode.ts
 *
 * Client hook for the tenant's assistant runtime mode (/api/modes). The tenant
 * is resolved server-side from the session cookie, so this never sends a
 * tenant ID. Used by the dashboard header and the quick-controls card.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface RuntimeModeDefinition {
  id: string;
  label: string;
  instruction: string;
  status: string;
}

export interface RuntimeModeStatus {
  mode: string;
  label: string;
  expiresAt: string | null;
  expired: boolean;
}

export interface RuntimeState {
  tenantId: string;
  mode: string;
  label: string | null;
  instruction: string | null;
  expiresAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface AssistantModePayload {
  state: RuntimeState;
  effective: RuntimeState;
  status: RuntimeModeStatus;
  active: boolean;
  modes: RuntimeModeDefinition[];
}

export interface SetModeOptions {
  label?: string;
  instruction?: string;
  expiresAt?: string | null;
}

export interface AssistantModeState {
  data: AssistantModePayload | null;
  status: RuntimeModeStatus | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setMode: (mode: string, options?: SetModeOptions) => Promise<boolean>;
  clearMode: () => Promise<boolean>;
}

export function useAssistantMode(pollMs = 30000): AssistantModeState {
  const [data, setData] = useState<AssistantModePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/modes", { cache: "no-store" });
      const payload = (await response.json()) as AssistantModePayload & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "Failed to load mode");
      if (!mountedRef.current) return;
      setData(payload);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load mode");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!pollMs) return;
    const interval = window.setInterval(() => void reload(), pollMs);
    return () => window.clearInterval(interval);
  }, [reload, pollMs]);

  const setMode = useCallback(
    async (mode: string, options: SetModeOptions = {}): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/modes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, ...options }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error || "Failed to set mode");
        await reload();
        return true;
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Failed to set mode");
        }
        return false;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [reload],
  );

  const clearMode = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/modes", { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "Failed to clear mode");
      await reload();
      return true;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to clear mode");
      }
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [reload]);

  return { data, status: data?.status ?? null, loading, busy, error, reload, setMode, clearMode };
}