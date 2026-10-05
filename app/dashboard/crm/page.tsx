"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Check, Loader2, MessageSquare, PhoneCall, Sparkles } from "lucide-react";

import AppShell from "@/components/app/AppShell";
import { telHref } from "@/components/app/attention";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
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

function statusVariant(status: string): BadgeProps["variant"] {
  return ["confirmed", "handled", "contacted", "read"].includes(status) ? "success" : "warning";
}

/** A single inbox record rendered as a scannable card (no horizontal scroll). */
function InboxCard({
  title,
  contact,
  meta,
  status,
  action,
  phone,
}: {
  title: ReactNode;
  contact?: ReactNode;
  meta: { label: string; value: ReactNode }[];
  status?: ReactNode;
  action?: ReactNode;
  phone?: string | null;
}) {
  const tel = telHref(phone);
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            {contact && <p className="mt-0.5 truncate text-xs text-muted-foreground">{contact}</p>}
          </div>
          {status}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {meta.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 truncate text-sm text-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>

        {(action || tel) && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tel && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={tel} aria-label={`Call back ${typeof title === "string" ? title : "this caller"}`}>
                  <PhoneCall className="h-3.5 w-3.5" aria-hidden /> Call back
                </a>
              </Button>
            )}
            {action}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" aria-hidden />}
      {done ? "Done" : label}
    </Button>
  );
}

export default function CrmPage() {
  const { toast } = useToast();
  const [data, setData] = useState<InboxPayload>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const load = useCallback(
    async (silent = false) => {
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
    },
    [],
  );

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
          return { ...prev, messages: prev.messages.map((m) => (m.id === id ? { ...m, read: true } : m)) };
        });
        toast({ message: "Marked as handled.", tone: "success" });
        void load(true);
      } catch {
        toast({ message: "Could not update item.", tone: "error" });
      } finally {
        setBusyId(null);
      }
    },
    [load, toast],
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

  const tabTrigger = "w-full gap-1.5 px-2";

  return (
    <AppShell
      eyebrow="Workspace"
      title="Inbox"
      description="Everything your assistant captured on calls — bookings, callbacks, quotes and messages."
      activeRoute="inbox"
      routeMode
      onRefresh={() => load()}
      refreshing={isRefreshing}
      lastSynced={lastSynced}
      contentWidth="narrow"
    >
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}

        {isLoading ? (
          <SkeletonRows rows={4} />
        ) : (
          <Tabs defaultValue="appointments" className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4">
              <TabsTrigger value="appointments" className={tabTrigger}>
                <CalendarClock className="h-4 w-4 shrink-0" aria-hidden /> Appointments
                <Badge variant="secondary">{counts.appointments}</Badge>
              </TabsTrigger>
              <TabsTrigger value="callbacks" className={tabTrigger}>
                <PhoneCall className="h-4 w-4 shrink-0" aria-hidden /> Callbacks
                <Badge variant="secondary">{counts.callbacks}</Badge>
              </TabsTrigger>
              <TabsTrigger value="quotes" className={tabTrigger}>
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden /> Quotes
                <Badge variant="secondary">{counts.quotes}</Badge>
              </TabsTrigger>
              <TabsTrigger value="messages" className={tabTrigger}>
                <MessageSquare className="h-4 w-4 shrink-0" aria-hidden /> Messages
                <Badge variant="secondary">{counts.messages}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="appointments" className="mt-5">
              {data.appointments.length === 0 ? (
                <EmptyState
                  icon={<CalendarClock className="h-5 w-5" />}
                  title="No appointments yet"
                  description="Bookings your assistant arranges with callers will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {data.appointments.map((a) => (
                    <InboxCard
                      key={a.id}
                      title={a.customerName}
                      contact={a.customerPhone || "No phone provided"}
                      phone={a.customerPhone}
                      status={<Badge variant={statusVariant(a.status)} className="capitalize">{a.status}</Badge>}
                      meta={[
                        { label: "When", value: `${a.date} · ${a.time}` },
                        { label: "Reason", value: a.reason || "—" },
                      ]}
                      action={
                        <HandleButton
                          label="Confirm"
                          done={a.status === "confirmed"}
                          busy={busyId === a.id}
                          onClick={() => markHandled("appointment", a.id)}
                        />
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="callbacks" className="mt-5">
              {data.callbacks.length === 0 ? (
                <EmptyState
                  icon={<PhoneCall className="h-5 w-5" />}
                  title="No callback requests yet"
                  description="Callers who ask to be called back will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {data.callbacks.map((c) => (
                    <InboxCard
                      key={c.id}
                      title={c.customerName}
                      contact={c.phone || "No phone provided"}
                      phone={c.phone}
                      status={<Badge variant={statusVariant(c.status)} className="capitalize">{c.status}</Badge>}
                      meta={[
                        { label: "Preferred time", value: c.preferredTime || "Any time" },
                        { label: "Reason", value: c.reason || "—" },
                      ]}
                      action={
                        <HandleButton
                          label="Mark handled"
                          done={c.status === "handled"}
                          busy={busyId === c.id}
                          onClick={() => markHandled("callback", c.id)}
                        />
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="quotes" className="mt-5">
              {data.quotes.length === 0 ? (
                <EmptyState
                  icon={<Sparkles className="h-5 w-5" />}
                  title="No quote requests yet"
                  description="Callers who ask for pricing or a quote will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {data.quotes.map((q) => (
                    <InboxCard
                      key={q.id}
                      title={q.customerName}
                      contact={q.phone || "No phone provided"}
                      phone={q.phone}
                      status={<Badge variant={statusVariant(q.status)} className="capitalize">{q.status}</Badge>}
                      meta={[
                        { label: "Project", value: q.projectType || "—" },
                        { label: "Timeline", value: q.timeline || "—" },
                        { label: "Details", value: q.details || "—" },
                      ]}
                      action={
                        <HandleButton
                          label="Mark contacted"
                          done={q.status === "contacted"}
                          busy={busyId === q.id}
                          onClick={() => markHandled("quote", q.id)}
                        />
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="messages" className="mt-5">
              {data.messages.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare className="h-5 w-5" />}
                  title="No messages yet"
                  description="Notes callers leave for you will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {data.messages.map((m) => (
                    <Card key={m.id} className={cn(!m.read && "border-emerald-200 bg-success-soft/40")}>
                      <CardContent className="space-y-3 p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{m.customerName}</p>
                            {m.phone && <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.phone}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{formatWhen(m.createdAt)}</span>
                            <Badge variant={m.read ? "secondary" : "accent"}>{m.read ? "Read" : "New"}</Badge>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed text-foreground">{m.message}</p>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {telHref(m.phone) && (
                            <Button asChild size="sm" variant="outline" className="gap-1.5">
                              <a href={telHref(m.phone)!} aria-label={`Call back ${m.customerName}`}>
                                <PhoneCall className="h-3.5 w-3.5" aria-hidden /> Call back
                              </a>
                            </Button>
                          )}
                          <HandleButton
                            label="Mark read"
                            done={m.read}
                            busy={busyId === m.id}
                            onClick={() => markHandled("message", m.id)}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
