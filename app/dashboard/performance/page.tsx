"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Gauge, Timer, Waypoints, Zap } from "lucide-react";

import AppShell from "@/components/app/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/components/ui/use-media-query";
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

function CallMetricDetail({ call }: { call: CallMetric }) {
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Avg turn", value: formatMs(call.turnAvgMs) },
          { label: "P95 turn", value: formatMs(call.turnP95Ms) },
          { label: "Turns", value: call.turnCount.toString() },
          { label: "Gemini connect", value: formatMs(call.geminiConnectMs) },
          { label: "In proc / p95", value: `${formatMs(call.inProcAvgMs)} / ${formatMs(call.inProcP95Ms)}` },
          { label: "Out proc / p95", value: `${formatMs(call.outProcAvgMs)} / ${formatMs(call.outProcP95Ms)}` },
          { label: "Audio in", value: `${formatKb(call.inBytes)} · ${call.inChunks} chunks` },
          { label: "Audio out", value: `${formatKb(call.outBytes)} · ${call.outFrames} frames` },
          { label: "Barge-ins", value: call.interrupts.toString() },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-surface-2 p-3">
            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Tool timings</p>
        {Object.keys(call.tools).length === 0 ? (
          <p className="rounded-xl border border-border bg-surface-2 p-4 text-sm text-muted-foreground">
            No tools were called during this call.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-surface-2 text-left text-2xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Tool</th>
                  <th className="px-3 py-2">Calls</th>
                  <th className="px-3 py-2">Avg</th>
                  <th className="px-3 py-2">P95</th>
                  <th className="px-3 py-2">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(call.tools).map(([name, tool]) => (
                  <tr key={name}>
                    <td className="px-3 py-2 font-medium text-foreground">{name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{tool.count}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatMs(tool.avg)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatMs(tool.p95)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{tool.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const isDesktop = useIsDesktop();
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
    <AppShell
      eyebrow="Manage"
      title="Performance"
      description="Per-call latency and throughput, recorded at the end of every call."
      activeRoute="performance"
      routeMode
      onRefresh={() => load()}
      refreshing={isRefreshing}
      lastSynced={lastSynced}
    >
      <div className="space-y-6">
        {error && <Notice tone="error">{error}</Notice>}

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        ) : !hasData ? (
          <EmptyState
            icon={<Waypoints className="h-6 w-6" />}
            title="No call performance data yet"
            description="Metrics are recorded automatically when a call (phone or browser) ends. Once the first call completes, its latency and throughput appear here."
            className="py-20"
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <Card key={kpi.label}>
                  <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
                    <CardDescription className="text-2xs uppercase tracking-[0.14em]">{kpi.label}</CardDescription>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      {kpi.icon}
                    </span>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl font-semibold text-foreground">{kpi.value}</span>
                      <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  <CardDescription className="text-2xs uppercase tracking-[0.14em]">Calls measured</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-display text-2xl font-semibold text-foreground">{summary?.samples ?? 0}</p>
                  <p className="text-sm text-muted-foreground">avg {formatDuration(summary?.avgDurationSec ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-2xs uppercase tracking-[0.14em]">Barge-ins</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-display text-2xl font-semibold text-foreground">{summary?.totalInterrupts ?? 0}</p>
                  <p className="text-sm text-muted-foreground">caller interruptions handled</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="text-2xs uppercase tracking-[0.14em]">Audio throughput</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-display text-2xl font-semibold text-foreground">{formatKb(summary?.totalInBytes)}</p>
                  <p className="text-sm text-muted-foreground">in · {formatKb(summary?.totalOutBytes)} out</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="font-display">Recent calls</CardTitle>
                  <CardDescription>{calls.length} measured calls · newest first</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] max-h-[560px] min-h-[320px] pr-4">
                    <div className="space-y-2">
                      {calls.map((call) => (
                        <button
                          key={call.callId}
                          type="button"
                          onClick={() => setSelectedCallId(call.callId)}
                          aria-pressed={selectedCallId === call.callId}
                          className={cn(
                            "w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selectedCallId === call.callId
                              ? "border-primary/30 bg-primary-soft/50"
                              : "border-border bg-card hover:border-primary/20",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {call.caller || "Unknown caller"}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(call.startedAt)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="capitalize">{call.channel}</Badge>
                            {call.outcome && <Badge variant="outline" className="capitalize">{call.outcome}</Badge>}
                            <span className="flex items-center gap-1">
                              <Timer className="h-3 w-3" aria-hidden /> {formatMs(call.turnAvgMs)} avg turn
                            </span>
                            <span className="flex items-center gap-1">
                              <Zap className="h-3 w-3" aria-hidden /> {formatMs(call.geminiConnectMs)} connect
                            </span>
                            <span>{formatDuration(call.durationSec)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="hidden lg:sticky lg:top-24 lg:block lg:h-fit">
                <CardHeader>
                  <CardTitle className="font-display">Call detail</CardTitle>
                  <CardDescription>
                    {selectedCall ? `Call ${selectedCall.callSid}` : "Select a call to inspect its metrics."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedCall ? (
                    <CallMetricDetail call={selectedCall} />
                  ) : (
                    <div className="flex h-[420px] items-center justify-center">
                      <EmptyState
                        icon={<Activity className="h-5 w-5" />}
                        title="No call selected"
                        description="Choose a call from the list to see audio throughput, turn latency and tool timings."
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>

      {!isDesktop && (
        <Sheet
          open={Boolean(selectedCall)}
          onOpenChange={(open) => !open && setSelectedCallId(null)}
          side="bottom"
          title={selectedCall?.caller || "Call metrics"}
          description={selectedCall ? `Call ${selectedCall.callSid}` : undefined}
        >
          {selectedCall && <CallMetricDetail call={selectedCall} />}
        </Sheet>
      )}
    </AppShell>
  );
}
