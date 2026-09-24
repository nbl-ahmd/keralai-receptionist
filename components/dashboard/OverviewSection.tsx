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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Appointment, CallRecord, CallbackRequest, KnowledgeItem, MessageRow } from "@/types";

import { EmptyState, formatDuration, formatWhen, OutcomeBadge } from "./shared";
import type { DashboardTab } from "./DashboardSidebar";

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
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {helper && <p className="mt-0.5 text-xs text-slate-500">{helper}</p>}
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
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
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
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
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Recent calls</CardTitle>
              <CardDescription>Latest conversations handled by your assistant.</CardDescription>
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
              <ul className="divide-y divide-slate-100">
                {recentCalls.map((call) => (
                  <li key={call.id}>
                    <button
                      type="button"
                      onClick={() => onOpenCall(call.id)}
                      className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-slate-50/70"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <User className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{call.caller}</p>
                        <p className="truncate text-xs text-slate-500">{call.summary || call.intent || "General enquiry"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <OutcomeBadge outcome={call.outcome} />
                        <span className="text-xs text-slate-500">
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

        <Card className={cn(activeInstructions.length > 0 && "border-emerald-200/80")}>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-600" /> Active instructions
              </CardTitle>
              <CardDescription>Temporary instructions applied to new calls.</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onGoTo("instructions")}>
              <Plus className="h-3.5 w-3.5" /> Add
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
                    <Plus className="h-3.5 w-3.5" /> Add instruction
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {activeInstructions.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                          <Badge className="bg-emerald-600 text-white">Active</Badge>
                        </div>
                        <p className="mt-1.5 text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{item.content}</p>
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
                  className="flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Manage instructions <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Messages & callbacks</CardTitle>
              <CardDescription>People who left a note or asked to be called back.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onGoTo("calls")}>
              Review
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Messages</p>
              {recentMessages.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No messages left yet.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {recentMessages.map((message) => (
                    <li key={message.id} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {message.customerName}
                          {message.phone && <span className="font-normal text-slate-500"> · {message.phone}</span>}
                        </p>
                        {!message.read && <Badge className="bg-emerald-600 text-white">New</Badge>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{message.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Callback requests</p>
              {recentCallbacks.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No callback requests.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {recentCallbacks.map((callback) => (
                    <li key={callback.id} className="rounded-xl border border-slate-100 p-3">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {callback.customerName}
                        {callback.phone && <span className="font-normal text-slate-500"> · {callback.phone}</span>}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {callback.reason || "Asked to be called back"}
                        {callback.preferredTime && <span className="text-slate-500"> · {callback.preferredTime}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-slate-500" /> Bookings
              </CardTitle>
              <CardDescription>Times arranged with callers.</CardDescription>
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
              <ul className="divide-y divide-slate-100">
                {appointments.slice(0, 5).map((appointment) => (
                  <li key={appointment.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{appointment.customerName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {appointment.reason || (appointment.callSid ? "From a call" : "Added manually")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-medium text-slate-700">
                        {appointment.date} · {appointment.time}
                      </p>
                      <p className="text-xs capitalize text-slate-500">{appointment.status}</p>
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
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <BookOpen className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-slate-900">
                {knowledge.length} reference item{knowledge.length === 1 ? "" : "s"} the assistant can use
              </p>
              <p className="text-xs text-slate-500">
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
              <Plus className="h-3.5 w-3.5" /> Add instruction
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default OverviewSection;
