import { Brain, CalendarClock, Clock, PhoneCall, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Appointment, CallRecord } from "@/types";

import { EmptyState, formatDuration, formatWhen, OutcomeBadge } from "./shared";

type CallFilter = "all" | CallRecord["outcome"];

interface CallsSectionProps {
  filteredCalls: CallRecord[];
  callFilter: CallFilter;
  onFilterChange: (filter: CallFilter) => void;
  selectedCall: CallRecord | null;
  callBookings: Appointment[];
  loading: boolean;
  onSelectCall: (id: string) => void;
}

export function CallsSection({
  filteredCalls,
  callFilter,
  onFilterChange,
  selectedCall,
  callBookings,
  loading,
  onSelectCall,
}: CallsSectionProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Call history</CardTitle>
            <CardDescription>
              {filteredCalls.length} {filteredCalls.length === 1 ? "call" : "calls"}
            </CardDescription>
          </div>
          <Select value={callFilter} onValueChange={(v) => onFilterChange(v as CallFilter)}>
            <SelectTrigger className="sm:w-[170px]" aria-label="Filter calls by outcome">
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
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
              ))}
            </div>
          ) : filteredCalls.length === 0 ? (
            <EmptyState
              icon={<PhoneCall className="h-5 w-5" />}
              title="No calls yet"
              description="Once someone calls your assistant, conversations will appear here."
            />
          ) : (
            <ScrollArea className="h-[560px] pr-3">
              <div className="space-y-2.5">
                {filteredCalls.map((call) => (
                  <button
                    key={call.id}
                    type="button"
                    onClick={() => onSelectCall(call.id)}
                    aria-pressed={selectedCall?.id === call.id}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-colors",
                      selectedCall?.id === call.id
                        ? "border-emerald-300 bg-emerald-50/50"
                        : "border-slate-200/80 bg-white hover:border-emerald-200 hover:bg-slate-50/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                        <User className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate">{call.caller}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{formatWhen(call.startedAt)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-sm text-slate-600">
                      {call.summary || call.intent || "General enquiry"}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <OutcomeBadge outcome={call.outcome} />
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatDuration(call.durationSec)}
                      </span>
                      <span className="capitalize">{call.channel}</span>
                      {call.bookingIds.length > 0 && (
                        <span className="flex items-center gap-1 text-emerald-700">
                          <CalendarClock className="h-3 w-3" /> {call.bookingIds.length} booking
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-6 lg:h-fit">
        <CardHeader>
          <CardTitle>Call details</CardTitle>
          <CardDescription>
            {selectedCall ? formatWhen(selectedCall.startedAt) : "Select a call to see the full conversation."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedCall ? (
            <div className="flex h-[520px] items-center justify-center">
              <EmptyState
                icon={<PhoneCall className="h-5 w-5" />}
                title="No call selected"
                description="Pick a call from the history to view the transcript, summary, and any actions taken."
              />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                    {selectedCall.caller.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selectedCall.caller}</p>
                    <p className="text-xs text-slate-500">
                      {selectedCall.phone || selectedCall.channel} · {formatDuration(selectedCall.durationSec)}
                    </p>
                  </div>
                </div>
                <OutcomeBadge outcome={selectedCall.outcome} />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: "Sentiment", value: selectedCall.sentiment || "—" },
                  { label: "Turns", value: selectedCall.transcript.length.toString() },
                  { label: "Channel", value: selectedCall.channel },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-slate-100 p-3">
                    <p className="text-xs text-slate-500">{stat.label}</p>
                    <p className="mt-1 text-sm font-medium capitalize text-slate-900">{stat.value}</p>
                  </div>
                ))}
              </div>

              {selectedCall.summary && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Summary</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-700">{selectedCall.summary}</p>
                </div>
              )}

              {callBookings.length > 0 && (
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-4">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
                    <CalendarClock className="h-4 w-4" /> Bookings from this call
                  </p>
                  <div className="mt-2 space-y-2">
                    {callBookings.map((appointment) => (
                      <div key={appointment.id} className="flex items-center justify-between text-sm text-emerald-900">
                        <span className="font-medium">{appointment.customerName}</span>
                        <span>
                          {appointment.date} · {appointment.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCall.knowledgeQueries.length > 0 && (
                <div className="rounded-xl border border-slate-100 p-4">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Brain className="h-4 w-4" /> Knowledge looked up
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedCall.knowledgeQueries.map((query, idx) => (
                      <Badge key={idx} variant="secondary">
                        {query}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Transcript</p>
                <ScrollArea className="h-[260px] rounded-xl border border-slate-100 p-4">
                  <div className="space-y-3">
                    {selectedCall.transcript.map((turn, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                          turn.role === "caller"
                            ? "bg-slate-100 text-slate-800"
                            : "ml-auto bg-emerald-100 text-emerald-900",
                        )}
                      >
                        <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          {turn.role === "caller" ? "Caller" : "Assistant"}
                        </p>
                        {turn.text}
                      </div>
                    ))}
                    {selectedCall.transcript.length === 0 && (
                      <p className="py-6 text-center text-sm text-slate-500">
                        No transcript captured for this call.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default CallsSection;
