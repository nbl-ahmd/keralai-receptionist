import {
  BookOpen,
  LayoutDashboard,
  Mic,
  PhoneCall,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";

const NAV = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Calls", icon: PhoneCall, active: false },
  { label: "Knowledge", icon: BookOpen, active: false },
  { label: "Instructions", icon: Zap, active: false },
  { label: "Voice", icon: Mic, active: false },
];

const CALLS = [
  { name: "Anand K.", note: "Callback after 6 PM", time: "12:04" },
  { name: "Fathima R.", note: "Asked about availability", time: "11:38" },
  { name: "Unknown number", note: "Message taken", time: "10:12" },
];

/**
 * A static, clearly-labelled mock of the KeralAI dashboard used on the landing
 * page. It is illustrative only and contains no real data.
 */
export function DashboardPreview({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
          <span className="ml-3 text-xs font-medium text-slate-500">keralai / dashboard</span>
        </div>

        <div className="grid sm:grid-cols-[168px_1fr]">
          <aside className="hidden border-r border-slate-100 p-3 sm:block">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-600 text-[10px] font-bold text-white">
                KA
              </span>
              <span className="text-xs font-semibold text-slate-900">KeralAI</span>
            </div>
            <nav className="mt-3 space-y-0.5">
              {NAV.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium ${
                    item.active ? "bg-emerald-50 text-emerald-700" : "text-slate-500"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </div>
              ))}
            </nav>
            <div className="mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500">
              <Settings2 className="h-3.5 w-3.5" /> Settings
            </div>
          </aside>

          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Your AI assistant</p>
                <p className="text-xs text-slate-500">Handles calls and keeps you informed.</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                <Sparkles className="h-3 w-3" /> Assistant ready
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "Calls", value: "18" },
                { label: "Messages", value: "4" },
                { label: "Active instructions", value: "1" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{stat.label}</p>
                  <p className="mt-0.5 text-lg font-semibold text-slate-900">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Active instruction</p>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </div>
              <p className="mt-1 text-xs text-slate-700">In a meeting. Tell callers we will call back.</p>
            </div>

            <div className="mt-3 space-y-1.5">
              {CALLS.map((call) => (
                <div key={call.name} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{call.name}</p>
                    <p className="truncate text-[11px] text-slate-500">{call.note}</p>
                  </div>
                  <span className="text-[11px] text-slate-500">{call.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPreview;
