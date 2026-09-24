"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Gauge,
  Loader2,
  RefreshCw,
  Timer,
  TriangleAlert,
  Waypoints,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CallMetric, CallMetricsSummary } from "@/types";

function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function formatKb(bytes: number | null | undefined): string {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(1)} KB`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function PerformancePage() {
  const [summary, setSummary] = useState<CallMetricsSummary | null>(null);
  const [calls, setCalls] = useState<CallMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const response = await fetch("/api/call-metrics?limit=200", { cache: "no-store" });
      const data = (await response.json()) as {
        summary?: CallMetricsSummary;
        calls?: CallMetric[];
        error?: string;
      };
      if (!response.ok || data.error) throw new Error(data.error || "Failed to load metrics");
      setSummary(data.summary ?? null);
      setCalls(Array.isArray(data.calls) ? data.calls : []);
      setError(null);
      setLastSynced(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const selectedCall = useMemo(
    () => calls.find((call) => call.callId === selectedCallId) ?? null,
    [calls, selectedCallId],
  );

  const kpis = useMemo(() => {
    if (!summary) return [];
    return [
      {
        label: "Avg turn latency",
        value: formatMs(summary.avgTurnMs),
        helper: `${summary.p50TurnMs === null ? "—" : formatMs(summary.p50TurnMs)} median`,
        icon: <Timer className="h-4 w-4" />,
      },
      {
        label: "P95 turn latency",
        value: formatMs(summary.p95TurnMs),
        helper: `worst ${formatMs(summary.worstTurnP95Ms)}`,
        icon: <Gauge className="h-4 w-4" />,
      },
      {
        label: "Gemini connect",
        value: formatMs(summary.avgGeminiConnectMs),
        helper: "avg time to ready",
        icon: <Zap className="h-4 w-4" />,
      },
      {
        label: "Audio processing",
        value: formatMs(summary.avgInProcMs),
        helper: `out ${formatMs(summary.avgOutProcMs)}`,
        icon: <Activity className="h-4 w-4" />,
      },
    ];
  }, [summary]);

  const hasData = (summary?.samples ?? 0) > 0;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="mx-auto flex max-w-7xl flex-col gap-4 px-4 pb-6 pt-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:pt-8">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
            title="Back to dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">KeralAI</p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Performance</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Per-call latency and throughput, saved at the end of every call.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:block">
            {lastSynced
              ? `Synced ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Syncing…"}
          </span>
          <Button variant="ghost" size="sm" className="gap-1.5 text-slate-600" onClick={() => load()} disabled={isRefreshing}>
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 pb-14 sm:px-6">
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading performance data…
          </div>
        ) : !hasData ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <Waypoints className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No call performance data yet</p>
              <p className="max-w-md text-sm text-slate-500">
                Metrics are recorded automatically when a call (phone or browser) ends. Once the first
                call completes, its latency and throughput appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <Card key={kpi.label} className="shadow-card">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardDescription className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      {kpi.label}
                    </CardDescription>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      {kpi.icon}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-semibold text-slate-900">{kpi.value}</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                        {kpi.helper}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Calls measured
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-slate-900">{summary?.samples ?? 0}</p>
                  <p className="text-sm text-slate-500">avg {formatDuration(summary?.avgDurationSec ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Barge-ins
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-slate-900">{summary?.totalInterrupts ?? 0}</p>
                  <p className="text-sm text-slate-500">caller interruptions handled</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Audio throughput
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-slate-900">{formatKb(summary?.totalInBytes)}</p>
                  <p className="text-sm text-slate-500">in · {formatKb(summary?.totalOutBytes)} out</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Recent calls</CardTitle>
                  <CardDescription>{calls.length} measured calls · newest first</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] max-h-[560px] min-h-[320px] pr-4">
                    <div className="space-y-2">
                      {calls.map((call) => (
                        <button
                          key={call.callId}
                          onClick={() => setSelectedCallId(call.callId)}
                          className={cn(
                            "w-full rounded-2xl border p-3 text-left transition",
                            selectedCallId === call.callId
                              ? "border-emerald-300 bg-emerald-50/50 shadow-sm"
                              : "border-slate-100 bg-white hover:border-emerald-200",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-slate-900">
                              {call.caller || "Unknown caller"}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">{formatWhen(call.startedAt)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <Badge variant="secondary" className="capitalize">
                              {call.channel}
                            </Badge>
                            {call.outcome && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold capitalize text-slate-700">
                                {call.outcome}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Timer className="h-3 w-3" /> {formatMs(call.turnAvgMs)} avg turn
                            </span>
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" /> {formatMs(call.geminiConnectMs)} connect
                            </span>
                            <span>{formatDuration(call.durationSec)}</span>
                            {call.interrupts > 0 && <span>{call.interrupts} barge-in(s)</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Call detail</CardTitle>
                  <CardDescription>
                    {selectedCall ? `Call ${selectedCall.callSid}` : "Select a call to inspect its metrics."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!selectedCall ? (
                    <div className="flex h-[320px] flex-col items-center justify-center text-center lg:h-[520px]">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                        <Activity className="h-7 w-7 text-slate-400" />
                      </div>
                      <p className="text-sm text-slate-500">
                        Choose a call from the list to see audio throughput, turn latency, and tool timings.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[
                          { label: "Avg turn", value: formatMs(selectedCall.turnAvgMs) },
                          { label: "P95 turn", value: formatMs(selectedCall.turnP95Ms) },
                          { label: "Turns", value: selectedCall.turnCount.toString() },
                          { label: "Gemini connect", value: formatMs(selectedCall.geminiConnectMs) },
                          { label: "In proc / p95", value: `${formatMs(selectedCall.inProcAvgMs)} / ${formatMs(selectedCall.inProcP95Ms)}` },
                          { label: "Out proc / p95", value: `${formatMs(selectedCall.outProcAvgMs)} / ${formatMs(selectedCall.outProcP95Ms)}` },
                          { label: "Audio in", value: `${formatKb(selectedCall.inBytes)} · ${selectedCall.inChunks} chunks` },
                          { label: "Audio out", value: `${formatKb(selectedCall.outBytes)} · ${selectedCall.outFrames} frames` },
                          { label: "Barge-ins", value: selectedCall.interrupts.toString() },
                        ].map((stat) => (
                          <div key={stat.label} className="rounded-2xl border border-slate-100 p-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{stat.label}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{stat.value}</p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Tool timings</p>
                        {Object.keys(selectedCall.tools).length === 0 ? (
                          <p className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
                            No tools were called during this call.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-2xl border border-slate-100">
                            <table className="w-full min-w-[420px] text-sm">
                              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">Tool</th>
                                  <th className="px-3 py-2">Calls</th>
                                  <th className="px-3 py-2">Avg</th>
                                  <th className="px-3 py-2">P95</th>
                                  <th className="px-3 py-2">Failed</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {Object.entries(selectedCall.tools).map(([name, tool]) => (
                                  <tr key={name}>
                                    <td className="px-3 py-2 font-medium text-slate-800">{name}</td>
                                    <td className="px-3 py-2 text-slate-600">{tool.count}</td>
                                    <td className="px-3 py-2 text-slate-600">{formatMs(tool.avg)}</td>
                                    <td className="px-3 py-2 text-slate-600">{formatMs(tool.p95)}</td>
                                    <td className="px-3 py-2 text-slate-600">{tool.failed}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
