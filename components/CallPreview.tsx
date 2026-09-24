import { CheckCircle2, MessageSquare, PhoneIncoming, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewTurn {
  role: "caller" | "assistant";
  text: string;
}

const TRANSCRIPT: PreviewTurn[] = [
  { role: "assistant", text: "Namaskaram, Nabeel's assistant here. How can I help?" },
  { role: "caller", text: "Is Nabeel free? I wanted to discuss the new project." },
  { role: "assistant", text: "He's in a meeting right now. I can take a message or arrange a callback." },
  { role: "caller", text: "Please ask him to call me back after 6." },
  { role: "assistant", text: "Done — I've noted a callback for after 6 PM. Anything else?" },
];

/**
 * Static, clearly-labelled illustration of a call being handled. It contains no
 * real caller data and is never presented as live.
 */
export function CallPreview({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <PhoneIncoming className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Incoming call</p>
              <p className="text-xs text-slate-500">Assistant answering</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>

        <div className="flex items-center gap-3 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
            AK
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Anand K.</p>
            <p className="text-xs text-slate-500">Malayalam · 01:24</p>
          </div>
        </div>

        <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          {TRANSCRIPT.map((turn, index) => (
            <div
              key={index}
              className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                turn.role === "assistant"
                  ? "ml-auto bg-emerald-600 text-white"
                  : "bg-white text-slate-700 ring-1 ring-slate-200/70",
              )}
            >
              {turn.text}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
          <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            <MessageSquare className="h-3.5 w-3.5" /> Message taken
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            <CalendarClock className="h-3.5 w-3.5" /> Callback requested
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Instruction applied
          </span>
        </div>
      </div>

      <div className="absolute -bottom-4 -left-3 hidden max-w-[15rem] rounded-xl border border-slate-200/80 bg-white p-3 shadow-card lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Active instruction</p>
        <p className="mt-1 text-sm text-slate-700">Tell callers Nabeel is in a meeting until 5 PM.</p>
      </div>
    </div>
  );
}

export default CallPreview;
