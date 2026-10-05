"use client";

/**
 * components/app/attention.tsx
 *
 * One source of truth for "things that need you". It polls the tenant's inbox
 * and recent calls, derives an actionable summary, and exposes it three ways:
 *
 *   1. Counts, used to badge the sidebar and mobile tab bar.
 *   2. A notification bell in the header (an accessible Sheet).
 *   3. A prominent `AttentionBanner` for the top of the dashboard.
 *
 * All data comes from existing tenant-scoped endpoints (`/api/inbox`,
 * `/api/calls`); nothing new is trusted from the client.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  MessageSquare,
  PhoneCall,
  PhoneForwarded,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsDesktop } from "@/components/ui/use-media-query";
import type {
  Appointment,
  CallRecord,
  CallbackRequest,
  MessageRow,
  QuoteRequest,
} from "@/types";

export type AttentionKind = "message" | "callback" | "quote" | "appointment" | "missed-call";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  contact: string | null;
  phone: string | null;
  detail: string;
  at: string | null;
  /** Destination to review the item. */
  href: string;
}

export interface AttentionCounts {
  messages: number;
  callbacks: number;
  quotes: number;
  appointments: number;
  missedCalls: number;
  /** Everything the inbox surface owns. */
  inbox: number;
  /** The single headline number across every surface. */
  total: number;
}

interface AttentionContextValue {
  counts: AttentionCounts;
  items: AttentionItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  markHandled: (item: AttentionItem) => Promise<void>;
}

const EMPTY_COUNTS: AttentionCounts = {
  messages: 0,
  callbacks: 0,
  quotes: 0,
  appointments: 0,
  missedCalls: 0,
  inbox: 0,
  total: 0,
};

const AttentionContext = createContext<AttentionContextValue | null>(null);

/** Missed calls stay actionable for two days; older ones drop off the counter. */
const MISSED_WINDOW_MS = 48 * 60 * 60 * 1000;

const DONE_STATUSES = new Set(["handled", "contacted", "completed", "confirmed", "cancelled"]);

function isActionableStatus(status?: string | null): boolean {
  if (!status) return true;
  return !DONE_STATUSES.has(status.toLowerCase());
}

/** Build a dialable `tel:` href, or null when the number is too short to use. */
export function telHref(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length >= 5 ? `tel:${cleaned}` : null;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function recency(item: AttentionItem): number {
  if (!item.at) return 0;
  const time = new Date(item.at).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function deriveAttention(
  calls: CallRecord[],
  appointments: Appointment[],
  callbacks: CallbackRequest[],
  quotes: QuoteRequest[],
  messages: MessageRow[],
): { counts: AttentionCounts; items: AttentionItem[] } {
  const unreadMessages = messages.filter((message) => !message.read);
  const pendingCallbacks = callbacks.filter((callback) => isActionableStatus(callback.status));
  const pendingQuotes = quotes.filter((quote) => isActionableStatus(quote.status));
  const pendingAppointments = appointments.filter((appointment) =>
    isActionableStatus(appointment.status),
  );
  const missedCalls = calls.filter(
    (call) =>
      call.outcome === "missed" &&
      (!call.startedAt || Date.now() - new Date(call.startedAt).getTime() <= MISSED_WINDOW_MS),
  );

  const items: AttentionItem[] = [
    ...unreadMessages.map<AttentionItem>((message) => ({
      id: `message:${message.id}`,
      kind: "message",
      title: message.customerName || "New message",
      contact: message.phone,
      phone: message.phone,
      detail: message.message,
      at: message.createdAt,
      href: "/dashboard/crm",
    })),
    ...pendingCallbacks.map<AttentionItem>((callback) => ({
      id: `callback:${callback.id}`,
      kind: "callback",
      title: callback.customerName || "Callback request",
      contact: callback.phone,
      phone: callback.phone,
      detail: callback.reason || "Asked to be called back",
      at: callback.createdAt,
      href: "/dashboard/crm",
    })),
    ...pendingQuotes.map<AttentionItem>((quote) => ({
      id: `quote:${quote.id}`,
      kind: "quote",
      title: quote.customerName || "Quote request",
      contact: quote.phone,
      phone: quote.phone,
      detail: quote.projectType || quote.details || "Asked for pricing",
      at: quote.createdAt,
      href: "/dashboard/crm",
    })),
    ...pendingAppointments.map<AttentionItem>((appointment) => ({
      id: `appointment:${appointment.id}`,
      kind: "appointment",
      title: appointment.customerName || "New booking",
      contact: appointment.customerPhone ?? null,
      phone: appointment.customerPhone ?? null,
      detail: `${appointment.date} · ${appointment.time}`,
      at: appointment.createdAt ?? null,
      href: "/dashboard/crm",
    })),
    ...missedCalls.map<AttentionItem>((call) => ({
      id: `missed-call:${call.id}`,
      kind: "missed-call",
      title: call.caller || "Missed call",
      contact: call.phone ?? null,
      phone: call.phone ?? null,
      detail: call.summary || call.intent || "No one answered this call",
      at: call.startedAt,
      href: "/dashboard#calls",
    })),
  ].sort((a, b) => recency(b) - recency(a));

  const counts: AttentionCounts = {
    messages: unreadMessages.length,
    callbacks: pendingCallbacks.length,
    quotes: pendingQuotes.length,
    appointments: pendingAppointments.length,
    missedCalls: missedCalls.length,
    inbox: pendingCallbacks.length + pendingQuotes.length + pendingAppointments.length + unreadMessages.length,
    total:
      pendingCallbacks.length +
      pendingQuotes.length +
      pendingAppointments.length +
      unreadMessages.length +
      missedCalls.length,
  };

  return { counts, items };
}

export function AttentionProvider({
  children,
  pollMs = 20000,
}: {
  children: React.ReactNode;
  pollMs?: number;
}) {
  const [counts, setCounts] = useState<AttentionCounts>(EMPTY_COUNTS);
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [inboxRes, callsRes] = await Promise.all([
        fetch("/api/inbox", { cache: "no-store" }).then((response) => response.json()),
        fetch("/api/calls", { cache: "no-store" }).then((response) => response.json()),
      ]);

      const appointments: Appointment[] = Array.isArray(inboxRes?.appointments)
        ? inboxRes.appointments
        : [];
      const callbacks: CallbackRequest[] = Array.isArray(inboxRes?.callbacks) ? inboxRes.callbacks : [];
      const quotes: QuoteRequest[] = Array.isArray(inboxRes?.quotes) ? inboxRes.quotes : [];
      const messages: MessageRow[] = Array.isArray(inboxRes?.messages) ? inboxRes.messages : [];
      const calls: CallRecord[] = Array.isArray(callsRes) ? callsRes : [];

      const next = deriveAttention(calls, appointments, callbacks, quotes, messages);
      setCounts(next.counts);
      setItems(next.items);
    } catch {
      // Attention is best-effort; a failed poll must never disrupt the page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!pollMs) return;
    const interval = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(interval);
  }, [refresh, pollMs]);

  const markHandled = useCallback(
    async (item: AttentionItem) => {
      const map: Partial<Record<AttentionKind, "appointment" | "callback" | "quote" | "message">> = {
        appointment: "appointment",
        callback: "callback",
        quote: "quote",
        message: "message",
      };
      const type = map[item.kind];
      if (!type) return;
      const rawId = item.id.slice(item.id.indexOf(":") + 1);
      try {
        await fetch("/api/inbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, id: rawId, read: true }),
        });
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ counts, items, loading, refresh, markHandled }),
    [counts, items, loading, refresh, markHandled],
  );

  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}

export function useAttention(): AttentionContextValue {
  const context = useContext(AttentionContext);
  if (!context) {
    throw new Error("useAttention must be used within an AttentionProvider");
  }
  return context;
}

const KIND_META: Record<
  AttentionKind,
  { label: string; icon: typeof Bell; className: string }
> = {
  message: { label: "Message", icon: MessageSquare, className: "bg-info-soft text-info" },
  callback: { label: "Callback", icon: PhoneForwarded, className: "bg-warning-soft text-warning" },
  quote: { label: "Quote", icon: Sparkles, className: "bg-primary-soft text-primary" },
  appointment: { label: "Booking", icon: CalendarClock, className: "bg-success-soft text-success" },
  "missed-call": { label: "Missed call", icon: PhoneCall, className: "bg-destructive-soft text-destructive" },
};

/** Small pill used on navigation items; text keeps it legible without colour. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold tabular-nums text-primary-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}

function AttentionRow({
  item,
  onHandled,
}: {
  item: AttentionItem;
  onHandled: (item: AttentionItem) => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const tel = telHref(item.phone);

  return (
    <li className="rounded-2xl border border-border bg-card p-3.5 shadow-xs">
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.className)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
            {item.at && <span className="shrink-0 text-2xs text-muted-foreground">{relativeTime(item.at)}</span>}
          </div>
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{meta.label}</p>
          {item.contact && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.contact}</p>}
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.detail}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {tel && (
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={tel} aria-label={`Call back ${item.title}`}>
                  <PhoneCall className="h-3.5 w-3.5" aria-hidden /> Call back
                </a>
              </Button>
            )}
            <Button asChild size="sm" variant="ghost" className="gap-1.5">
              <Link href={item.href as Route}>
                {item.kind === "missed-call" ? "View call" : "Review"}
              </Link>
            </Button>
            {item.kind !== "missed-call" && (
              <button
                type="button"
                onClick={() => onHandled(item)}
                className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Check className="h-3.5 w-3.5" aria-hidden /> Mark done
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Header notification control. Uses a bottom sheet on phones and a side drawer
 * on desktop, so it is reachable one-handed and never covers the whole screen
 * on a laptop.
 */
export function NotificationBell() {
  const { counts, items, markHandled } = useAttention();
  const [open, setOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const total = counts.total;

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={total > 0 ? `Notifications, ${total} need attention` : "Notifications"}
        title="Notifications"
        className="relative"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {total > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold tabular-nums text-destructive-foreground ring-2 ring-background">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        side={isDesktop ? "right" : "bottom"}
        title="Needs your attention"
        description={
          total > 0
            ? `${total} item${total === 1 ? "" : "s"} captured by your assistant.`
            : "You're all caught up."
        }
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface-2/60 px-6 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-emerald-600 shadow-xs ring-1 ring-border">
              <CheckCheck className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">Nothing waiting</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              New messages, callbacks, bookings and missed calls will show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <AttentionRow key={item.id} item={item} onHandled={markHandled} />
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

/**
 * Large, unmissable summary for the top of the dashboard. Deliberately renders
 * nothing when the workspace is clear so it never becomes visual noise.
 */
export function AttentionBanner() {
  const { counts, items, markHandled } = useAttention();

  if (counts.total === 0) return null;

  const chips = [
    { label: "Missed calls", value: counts.missedCalls, tone: "text-red-700 bg-destructive-soft" },
    { label: "Callbacks", value: counts.callbacks, tone: "text-amber-800 bg-warning-soft" },
    { label: "Messages", value: counts.messages, tone: "text-sky-800 bg-info-soft" },
    { label: "Quotes", value: counts.quotes, tone: "text-emerald-800 bg-primary-soft" },
    { label: "Bookings", value: counts.appointments, tone: "text-emerald-800 bg-success-soft" },
  ].filter((chip) => chip.value > 0);

  const topItems = items.slice(0, 3);

  return (
    <section
      aria-label="Needs your attention"
      className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-white shadow-sm"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Bell className="h-5 w-5" aria-hidden />
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-amber-50">
                {counts.total > 99 ? "99+" : counts.total}
              </span>
            </span>
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight text-foreground">
                {counts.total} thing{counts.total === 1 ? "" : "s"} need{counts.total === 1 ? "s" : ""} your attention
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Captured by your assistant while you were away.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5 bg-white/70">
            <Link href="/dashboard/crm">
              Open inbox
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                chip.tone,
              )}
            >
              <span className="tabular-nums">{chip.value}</span>
              {chip.label}
            </span>
          ))}
        </div>

        <ul className="space-y-2">
          {topItems.map((item) => (
            <AttentionRow key={item.id} item={item} onHandled={markHandled} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export default AttentionProvider;
