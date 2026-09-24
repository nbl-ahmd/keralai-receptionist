import Link from "next/link";
import {
  BookOpen,
  Gauge,
  Inbox,
  LayoutDashboard,
  Mic,
  PhoneCall,
  Settings2,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type DashboardTab = "overview" | "calls" | "knowledge" | "instructions" | "voice";

export interface NavItem {
  key: DashboardTab;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", description: "What's happening", icon: LayoutDashboard },
  { key: "calls", label: "Calls", description: "History and transcripts", icon: PhoneCall },
  { key: "knowledge", label: "Knowledge", description: "What it can reference", icon: BookOpen },
  { key: "instructions", label: "Instructions", description: "Temporary call behavior", icon: Zap },
  { key: "voice", label: "Voice", description: "How it sounds", icon: Mic },
];

const MANAGE_LINKS = [
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
  { href: "/dashboard/crm", label: "Inbox", icon: Inbox },
  { href: "/dashboard/performance", label: "Performance", icon: Gauge },
] as const;

interface DashboardSidebarProps {
  activeTab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
  ownerName?: string;
  configured: boolean;
}

export function DashboardSidebar({ activeTab, onSelect, ownerName, configured }: DashboardSidebarProps) {
  return (
    <aside className="hidden h-fit flex-col rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card lg:flex lg:sticky lg:top-6">
      <div className="flex items-center gap-2.5 px-2 py-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
          KA
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">KeralAI</p>
          <p className="text-xs text-slate-500">Personal assistant</p>
        </div>
      </div>

      <nav className="mt-4" aria-label="Assistant sections">
        <p className="px-2 text-xs font-medium uppercase tracking-wide text-slate-500">Assistant</p>
        <div className="mt-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
                  active ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-emerald-600" : "text-slate-500")} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <nav className="mt-6" aria-label="Manage">
        <p className="px-2 text-xs font-medium uppercase tracking-wide text-slate-500">Manage</p>
        <div className="mt-2 space-y-1">
          {MANAGE_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
            >
              <item.icon className="h-4 w-4 shrink-0 text-slate-500" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mt-6 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
        <div className="flex items-center gap-2">
          <span
            className={cn("h-2 w-2 rounded-full", configured ? "bg-emerald-500" : "bg-slate-300")}
            aria-hidden
          />
          <p className="text-xs font-semibold text-slate-700">
            {configured ? "Assistant configured" : "Setup needed"}
          </p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          {ownerName ? `Handling calls for ${ownerName}.` : "Add your details to get started."}
        </p>
      </div>
    </aside>
  );
}

export default DashboardSidebar;
