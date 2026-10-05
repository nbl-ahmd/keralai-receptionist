"use client";

import {
  Brain,
  CalendarClock,
  CheckCircle2,
  Clock,
  PhoneCall,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/components/ui/use-media-query";
import { cn } from "@/lib/utils";
import type { Appointment, CallRecord } from "@/types";

import { formatDuration, formatFullDate, formatWhen, OutcomeBadge } from "./shared";

type CallFilter = "all" | CallRecord["outcome"];

interface CallsSectionProps {
  filteredCalls: CallRecord[];
  callFilter: CallFilter;
  onFilterChange: (filter: CallFilter) => void;
  selectedCall: CallRecord | null;
  callBookings: Appointment[];
  loading: boolean;
  onSelectCall: (id: string) => void;
  onCloseDetail: () => void;
}

/** Shared detail body used by both the desktop panel and the mobile sheet. */
function CallDetail({ call, bookings }: { call: CallRecord; bookings: Appointment[] }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-foreground">
            {call.caller.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{call.caller}</p>
            <p className="truncate text-xs text-muted-foreground">
              {call.phone || call.channel} · {formatDuration(call.durationSec)}
            </p>
          </div>
        </div>
        <OutcomeBadge outcome={call.outcome} />
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Received", value: formatWhen(call.startedAt) },
          { label: "Sentiment", value: call.sentiment || "—" },
          { label: "Turns", value: call.transcript.length.toString() },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-surface-2 p-3">
            <dt className="text-2xs uppercase tracking-wide text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium capitalize text-foreground">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {call.summary && (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{call.summary}</p>
        </div>
      )}

      {bookings.length > 0 && (
        <div className="rounded-xl border border-emerald-200/70 bg-success-soft p-4">
          <p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-emerald-800">
            <CalendarClock className="h-4 w-4" aria-hidden /> Bookings from this call
          </p>
          <div className="mt-2 space-y-1.5">
            {bookings.map((appointment) => (
              <div key={appointment.id} className="flex items-center justify-between gap-3 text-sm text-emerald-900">
                <span className="truncate font-medium">{appointment.customerName}</span>
                <span className="shrink-0">
                  {appointment.date} · {appointment.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {call.knowledgeQueries.length > 0 && (
        <div className="rounded-xl border border-border p-4">
          <p className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Brain className="h-4 w-4" aria-hidden /> Knowledge looked up
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {call.knowledgeQueries.map((query, index) => (
              <Badge key={index} variant="secondary">
                {query}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Transcript</p>
        <div className="max-h-[280px] space-y-3 overflow-y-auto rounded-xl border border-border p-4 sm:max-h-[320px]">
          {call.transcript.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No transcript was captured for this call.
            </p>
          ) : (
            call.transcript.map((turn, index) => (
              <div
                key={index}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  turn.role === "caller"
                    ? "bg-surface-3 text-foreground"
                    : "ml-auto bg-primary-soft text-primary-soft-foreground",
                )}
              >
                <p className="mb-0.5 text-2xs font-semibold uppercase tracking-wide opacity-70">
                  {turn.role === "caller" ? "Caller" : "Assistant"}
                </p>
                {turn.text}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function CallsSection({
  filteredCalls,
  callFilter,
  onFilterChange,
  selectedCall,
  callBookings,
  loading,
  onSelectCall,
  onCloseDetail,
}: CallsSectionProps) {
  const isDesktop = useIsDesktop();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="font-display">Call history</CardTitle>
            <CardDescription>
              {filteredCalls.length} {filteredCalls.length === 1 ? "call" : "calls"}
            </CardDescription>
          </div>
          <Select value={callFilter} onValueChange={(value) => onFilterChange(value as CallFilter)}>
            <SelectTrigger className="sm:w-[180px]" aria-label="Filter calls by outcome">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All calls</SelectItem>
              <SelectItem value="answered">Answered</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="escalated">Follow-up</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {loading ? (
            <SkeletonRows rows={4} />
          ) : filteredCalls.length === 0 ? (
            <EmptyState
              icon={<PhoneCall className="h-5 w-5" />}
              title="No calls yet"
              description="Once someone calls your assistant, conversations will appear here with a transcript and summary."
            />
          ) : (
            <ScrollArea className="h-[62vh] max-h-[620px] min-h-[320px] pr-3">
              <ul className="space-y-2.5">
                {filteredCalls.map((call) => {
                  const selected = selectedCall?.id === call.id;
                  return (
                    <li key={call.id}>
                      <button
                        type="button"
                        onClick={() => onSelectCall(call.id)}
                        aria-pressed={selected}
                        className={cn(
                          "w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-primary/30 bg-primary-soft/60"
                            : "border-border bg-card hover:border-primary/20 hover:bg-surface-2",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                            <User className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                            <span className="truncate">{call.caller}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatWhen(call.startedAt)}</span>
                        </div>
                        <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
                          {call.summary || call.intent || "General enquiry"}
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <OutcomeBadge outcome={call.outcome} />
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden /> {formatDuration(call.durationSec)}
                          </span>
                          <span className="capitalize">{call.channel}</span>
                          {call.bookingIds.length > 0 && (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" aria-hidden /> {call.bookingIds.length} booking
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Desktop detail panel */}
      <Card className="hidden lg:sticky lg:top-24 lg:block lg:h-fit">
        <CardHeader>
          <CardTitle className="font-display">Call details</CardTitle>
          <CardDescription>
            {selectedCall ? formatFullDate(selectedCall.startedAt) : "Select a call to see the full conversation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedCall ? (
            <CallDetail call={selectedCall} bookings={callBookings} />
          ) : (
            <div className="flex h-[420px] items-center justify-center">
              <EmptyState
                icon={<PhoneCall className="h-5 w-5" />}
                title="No call selected"
                description="Pick a call from the history to view the transcript, summary and any actions taken."
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile detail as a bottom sheet */}
      {!isDesktop && (
        <Sheet
          open={Boolean(selectedCall)}
          onOpenChange={(open) => {
            if (!open) onCloseDetail();
          }}
          side="bottom"
          title={selectedCall?.caller ?? "Call details"}
          description={selectedCall ? formatFullDate(selectedCall.startedAt) : undefined}
        >
          {selectedCall && <CallDetail call={selectedCall} bookings={callBookings} />}
        </Sheet>
      )}
    </div>
  );
}

export default CallsSection;
