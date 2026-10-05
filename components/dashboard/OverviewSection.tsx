import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  MessageSquare,
  PhoneCall,
  PhoneForwarded,
  Plus,
  User,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Appointment, CallRecord, CallbackRequest, KnowledgeItem, MessageRow } from "@/types";

import { EmptyState, formatDuration, formatWhen, OutcomeBadge } from "./shared";
import type { DashboardTab } from "@/components/app/navigation";

interface OverviewSectionProps {
  calls: CallRecord[];
  callbacks: CallbackRequest[];
  messages: MessageRow[];
  knowledge: KnowledgeItem[];
  instructions: KnowledgeItem[];
  appointments: Appointment[];
  loading: boolean;
  onOpenCall: (id: string) => void;
  onGoTo: (tab: DashboardTab) => void;
  onToggleInstruction: (item: KnowledgeItem) => void;
}

function StatCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          {helper && <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          {icon}
        </span>
      </CardContent>
    </Card>
  );
}

export function OverviewSection({
  calls,
  callbacks,
  messages,
  knowledge,
  instructions,
  appointments,
  loading,
  onOpenCall,
  onGoTo,
  onToggleInstruction,
}: OverviewSectionProps) {
  const activeInstructions = instructions.filter((item) => item.isActive !== false);
  const unreadMessages = messages.filter((message) => !message.read).length;
  const recentCalls = calls.slice(0, 5);
  const recentMessages = messages.slice(0, 3);
  const recentCallbacks = callbacks.slice(0, 3);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Calls handled"
          value={calls.length.toString()}
          helper={`${appointments.length} booking${appointments.length === 1 ? "" : "s"}`}
          icon={<PhoneCall className="h-4 w-4" />}
        />
        <StatCard
          label="Messages"
          value={messages.length.toString()}
          helper={unreadMessages > 0 ? `${unreadMessages} unread` : "All read"}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <StatCard
          label="Callback requests"
          value={callbacks.length.toString()}
          helper={callbacks.length > 0 ? "Waiting on you" : "None pending"}
          icon={<PhoneForwarded className="h-4 w-4" />}
        />
        <StatCard
          label="Active instructions"
          value={activeInstructions.length.toString()}
          helper={`${knowledge.length} reference item${knowledge.length === 1 ? "" : "s"}`}
          icon={<Zap className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display">Recent calls</CardTitle>
              <CardDescription className="mt-1">Latest conversations handled by your assistant.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onGoTo("calls")}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {recentCalls.length === 0 ? (
              <EmptyState
                icon={<PhoneCall className="h-5 w-5" />}
                title="No calls yet"
                description="Once someone calls your assistant, conversations will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {recentCalls.map((call) => (
                  <li key={call.id}>
                    <button
                      type="button"
                      onClick={() => onOpenCall(call.id)}
                      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-slate-500">
                        <User className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{call.caller}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {call.summary || call.intent || "General enquiry"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <OutcomeBadge outcome={call.outcome} />
                        <span className="text-xs text-muted-foreground">
                          {formatWhen(call.startedAt)} · {formatDuration(call.durationSec)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className={cn(activeInstructions.length > 0 && "border-emerald-200/70")}>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 font-display">
                <Zap className="h-4 w-4 text-primary" aria-hidden /> Active instructions
              </CardTitle>
              <CardDescription className="mt-1">Temporary instructions applied to new calls.</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onGoTo("instructions")}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {activeInstructions.length === 0 ? (
              <EmptyState
                icon={<Zap className="h-5 w-5" />}
                title="No temporary instructions are active"
                description="Add an instruction when you want the assistant to behave differently for upcoming calls."
                action={
                  <Button size="sm" className="gap-1.5" onClick={() => onGoTo("instructions")}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add instruction
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {activeInstructions.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-xl border border-emerald-200/70 bg-success-soft/50 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Badge variant="success">Active</Badge>
                        <p className="mt-1.5 text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.content}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => onToggleInstruction(item)}>
                        Turn off
                      </Button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onGoTo("instructions")}
                  className="flex items-center gap-1 text-sm font-medium text-primary-soft-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Manage instructions <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="font-display">Messages &amp; callbacks</CardTitle>
              <CardDescription className="mt-1">People who left a note or asked to be called back.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onGoTo("calls")}>
              Review
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Messages</p>
              {recentMessages.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No messages left yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {recentMessages.map((message) => (
                    <li key={message.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {message.customerName}
                          {message.phone && <span className="font-normal text-muted-foreground"> · {message.phone}</span>}
                        </p>
                        {!message.read && <Badge variant="accent">New</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{message.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Callback requests</p>
              {recentCallbacks.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No callback requests.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {recentCallbacks.map((callback) => (
                    <li key={callback.id} className="rounded-xl border border-border p-3">
                      <p className="truncate text-sm font-medium text-foreground">
                        {callback.customerName}
                        {callback.phone && <span className="font-normal text-muted-foreground"> · {callback.phone}</span>}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {callback.reason || "Asked to be called back"}
                        {callback.preferredTime && <span className="text-muted-foreground"> · {callback.preferredTime}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 font-display">
                <CalendarClock className="h-4 w-4 text-slate-500" aria-hidden /> Bookings
              </CardTitle>
              <CardDescription className="mt-1">Times arranged with callers.</CardDescription>
            </div>
            <Badge variant="secondary">{appointments.length}</Badge>
          </CardHeader>
          <CardContent>
            {appointments.length === 0 ? (
              <EmptyState
                icon={<CalendarClock className="h-5 w-5" />}
                title="No bookings yet"
                description="When your assistant arranges a time with a caller, it appears here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {appointments.slice(0, 5).map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{appointment.customerName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {appointment.reason || (appointment.callSid ? "From a call" : "Added manually")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-foreground">
                        {appointment.date} · {appointment.time}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">{appointment.status}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3 text-slate-500">
              <BookOpen className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {knowledge.length} reference item{knowledge.length === 1 ? "" : "s"} the assistant can use
              </p>
              <p className="text-xs text-muted-foreground">
                {activeInstructions.length > 0
                  ? `${activeInstructions.length} active instruction${activeInstructions.length === 1 ? "" : "s"} will apply to new calls.`
                  : "No active instructions right now."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onGoTo("knowledge")}>
              Manage knowledge
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => onGoTo("instructions")}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add instruction
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default OverviewSection;
