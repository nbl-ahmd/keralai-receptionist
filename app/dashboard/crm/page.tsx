"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Loader2,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Appointment, CallbackRequest, MessageRow, QuoteRequest } from "@/types";

type InboxPayload = {
  appointments: Appointment[];
  callbacks: CallbackRequest[];
  quotes: QuoteRequest[];
  messages: MessageRow[];
};

const EMPTY: InboxPayload = { appointments: [], callbacks: [], quotes: [], messages: [] };

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CrmPage() {
  const [data, setData] = useState<InboxPayload>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const response = await fetch("/api/inbox", { cache: "no-store" });
      const payload = (await response.json()) as InboxPayload & { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || "Failed to load");
      setData({
        appointments: payload.appointments ?? [],
        callbacks: payload.callbacks ?? [],
        quotes: payload.quotes ?? [],
        messages: payload.messages ?? [],
      });
      setError(null);
      setLastSynced(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
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

  const markHandled = useCallback(
    async (type: "appointment" | "callback" | "quote" | "message", id: string) => {
      setBusyId(id);
      try {
        await fetch("/api/inbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            id,
            status:
              type === "appointment" ? "confirmed" : type === "callback" ? "handled" : "contacted",
            read: true,
          }),
        });
        // Reflect immediately, then reconcile with the server.
        setData((prev) => {
          if (type === "appointment") {
            return {
              ...prev,
              appointments: prev.appointments.map((a) => (a.id === id ? { ...a, status: "confirmed" } : a)),
            };
          }
          if (type === "callback") {
            return {
              ...prev,
              callbacks: prev.callbacks.map((c) => (c.id === id ? { ...c, status: "handled" } : c)),
            };
          }
          if (type === "quote") {
            return {
              ...prev,
              quotes: prev.quotes.map((q) => (q.id === id ? { ...q, status: "contacted" } : q)),
            };
          }
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === id ? { ...m, read: true } : m)),
          };
        });
        void load(true);
      } catch {
        setError("Could not update item");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const counts = useMemo(
    () => ({
      appointments: data.appointments.length,
      callbacks: data.callbacks.length,
      quotes: data.quotes.length,
      messages: data.messages.length,
      unhandledMessages: data.messages.filter((m) => !m.read).length,
    }),
    [data],
  );

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
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Inbox</h1>
            <p className="mt-0.5 text-sm text-slate-500">Everything your assistant captured on calls.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:block">
            {lastSynced ? `Synced ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Syncing…"}
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
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading inbox…
          </div>
        ) : (
          <Tabs defaultValue="appointments" className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4">
              <TabsTrigger value="appointments" className="w-full gap-1.5 px-2">
                <CalendarClock className="h-4 w-4 shrink-0" /> Appointments <Badge variant="secondary">{counts.appointments}</Badge>
              </TabsTrigger>
              <TabsTrigger value="callbacks" className="w-full gap-1.5 px-2">
                <PhoneCall className="h-4 w-4 shrink-0" /> Callbacks <Badge variant="secondary">{counts.callbacks}</Badge>
              </TabsTrigger>
              <TabsTrigger value="quotes" className="w-full gap-1.5 px-2">
                <Sparkles className="h-4 w-4 shrink-0" /> Quotes <Badge variant="secondary">{counts.quotes}</Badge>
              </TabsTrigger>
              <TabsTrigger value="messages" className="w-full gap-1.5 px-2">
                <MessageSquare className="h-4 w-4 shrink-0" /> Messages <Badge variant="secondary">{counts.messages}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* Appointments */}
            <TabsContent value="appointments" className="mt-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Appointments</CardTitle>
                  <CardDescription>Bookings arranged by your assistant (newest first).</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] max-h-[560px] min-h-[320px] pr-2">
                    <Table
                      head={["Guest", "Phone", "When", "Reason", "Status", ""]}
                      empty="No appointments yet."
                      rows={data.appointments.map((a) => ({
                        id: a.id,
                        cells: [
                          <span key="n" className="font-semibold text-slate-900">{a.customerName}</span>,
                          <span key="p" className="text-slate-600">{a.customerPhone || "—"}</span>,
                          <span key="w" className="text-slate-600">{a.date} · {a.time}</span>,
                          <span key="r" className="text-slate-500">{a.reason || "—"}</span>,
                          <StatusBadge key="s" status={a.status} />,
                          <HandleButton
                            key="b"
                            label="Confirm"
                            done={a.status === "confirmed"}
                            busy={busyId === a.id}
                            onClick={() => markHandled("appointment", a.id)}
                          />,
                        ],
                      }))}
                    />
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Callbacks */}
            <TabsContent value="callbacks" className="mt-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Callback requests</CardTitle>
                  <CardDescription>Callers who asked to be called back.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] max-h-[560px] min-h-[320px] pr-2">
                    <Table
                      head={["Name", "Phone", "Preferred", "Reason", "Status", ""]}
                      empty="No callback requests yet."
                      rows={data.callbacks.map((c) => ({
                        id: c.id,
                        cells: [
                          <span key="n" className="font-semibold text-slate-900">{c.customerName}</span>,
                          <span key="p" className="text-slate-600">{c.phone || "—"}</span>,
                          <span key="t" className="text-slate-600">{c.preferredTime || "—"}</span>,
                          <span key="r" className="text-slate-500">{c.reason || "—"}</span>,
                          <StatusBadge key="s" status={c.status} />,
                          <HandleButton
                            key="b"
                            label="Mark handled"
                            done={c.status === "handled"}
                            busy={busyId === c.id}
                            onClick={() => markHandled("callback", c.id)}
                          />,
                        ],
                      }))}
                    />
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Quotes */}
            <TabsContent value="quotes" className="mt-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Quote requests</CardTitle>
                  <CardDescription>Callers who asked for pricing or a quote.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] max-h-[560px] min-h-[320px] pr-2">
                    <Table
                      head={["Name", "Phone", "Project", "Details", "Timeline", "Status", ""]}
                      empty="No quote requests yet."
                      rows={data.quotes.map((q) => ({
                        id: q.id,
                        cells: [
                          <span key="n" className="font-semibold text-slate-900">{q.customerName}</span>,
                          <span key="p" className="text-slate-600">{q.phone || "—"}</span>,
                          <span key="pt" className="text-slate-600">{q.projectType || "—"}</span>,
                          <span key="d" className="text-slate-500">{q.details || "—"}</span>,
                          <span key="t" className="text-slate-600">{q.timeline || "—"}</span>,
                          <StatusBadge key="s" status={q.status} />,
                          <HandleButton
                            key="b"
                            label="Mark contacted"
                            done={q.status === "contacted"}
                            busy={busyId === q.id}
                            onClick={() => markHandled("quote", q.id)}
                          />,
                        ],
                      }))}
                    />
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Messages */}
            <TabsContent value="messages" className="mt-6">
              <Card className="shadow-card">
                <CardHeader className="flex items-start justify-between">
                  <div>
                    <CardTitle>General messages</CardTitle>
                    <CardDescription>Anything else callers asked to pass on.</CardDescription>
                  </div>
                  {counts.unhandledMessages > 0 && (
                    <Badge variant="accent">{counts.unhandledMessages} unread</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[60vh] max-h-[560px] min-h-[320px] pr-2">
                    <div className="space-y-3">
                      {data.messages.length === 0 && (
                        <p className="py-10 text-center text-sm text-slate-500">No messages yet.</p>
                      )}
                      {data.messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "rounded-2xl border p-4",
                            m.read ? "border-slate-100 bg-white" : "border-emerald-200 bg-emerald-50/40",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">
                              {m.customerName} {m.phone ? <span className="font-normal text-slate-500">· {m.phone}</span> : null}
                            </span>
                            <span className="text-xs text-slate-500">{formatWhen(m.createdAt)}</span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">{m.message}</p>
                          <div className="mt-3 flex items-center gap-3">
                            <Badge variant={m.read ? "secondary" : "accent"}>{m.read ? "read" : "unread"}</Badge>
                            <HandleButton
                              label="Mark read"
                              done={m.read}
                              busy={busyId === m.id}
                              onClick={() => markHandled("message", m.id)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "confirmed" || status === "handled" || status === "contacted"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-amber-100 text-amber-800";
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", tone)}>{status}</span>;
}

function HandleButton({
  label,
  done,
  busy,
  onClick,
}: {
  label: string;
  done: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={done ? "ghost" : "outline"}
      className="gap-1.5 whitespace-nowrap"
      disabled={done || busy}
      onClick={onClick}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      {done ? "Done" : label}
    </Button>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: { id: string; cells: ReactNode[] }[];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              {row.cells.map((cell, i) => (
                <td key={i} className="px-4 py-3 align-middle">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
