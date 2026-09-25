"use client";

import Link from "next/link";
import type { Route } from "next";
import { BookOpen, Inbox, LayoutDashboard, PhoneCall, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DashboardTab } from "./DashboardSidebar";

interface MobileBottomNavProps {
  /** Active dashboard tab when rendered inside the dashboard. */
  activeTab?: DashboardTab;
  /** Called with the target tab; tabs are switched in place on the dashboard. */
  onSelect?: (tab: DashboardTab) => void;
  /**
   * When true, dashboard tabs render as `/dashboard#<tab>` links instead of
   * buttons, so the same nav works from settings, CRM, and performance pages.
   */
  linkMode?: boolean;
  /** Highlights a route-based destination in link mode. */
  activeRoute?: "inbox" | "settings";
}

const TAB_ITEMS: Array<{ key: DashboardTab; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "calls", label: "Calls", icon: PhoneCall },
  { key: "knowledge", label: "Knowledge", icon: BookOpen },
];

const ROUTE_ITEMS: Array<{
  key: "inbox" | "settings";
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
}> = [
  { key: "inbox", label: "Inbox", icon: Inbox, href: "/dashboard/crm" },
  { key: "settings", label: "Settings", icon: Settings2, href: "/dashboard/settings" },
];

const ITEM_CLASS =
  "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500";

/**
 * Fixed bottom navigation for phones and small tablets. Hidden at `lg` and up,
 * where the sidebar takes over. Each target is at least 56px tall, and the bar
 * respects the iOS safe-area inset.
 */
export function MobileBottomNav({
  activeTab,
  onSelect,
  linkMode = false,
  activeRoute,
}: MobileBottomNavProps) {
  const routes = linkMode
    ? [
        ...TAB_ITEMS.map((item) => ({
          key: item.key as string,
          label: item.label,
          icon: item.icon,
          href: `/dashboard#${item.key}`,
        })),
        ...ROUTE_ITEMS,
      ]
    : [
        ...TAB_ITEMS.map((item) => ({
          key: item.key as string,
          label: item.label,
          icon: item.icon,
          href: null,
        })),
        ...ROUTE_ITEMS,
      ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-lg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-5">
        {routes.map((item) => {
          const active = linkMode
            ? activeRoute === item.key
            : activeTab === item.key;
          const content = (
            <>
              <item.icon className={cn("h-5 w-5", active ? "text-emerald-600" : "text-slate-400")} />
              {item.label}
            </>
          );

          if (item.href) {
            return (
              <Link
                key={item.key}
                href={item.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(ITEM_CLASS, active ? "text-emerald-700" : "text-slate-500 hover:text-slate-700")}
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect?.(item.key as DashboardTab)}
              aria-current={active ? "page" : undefined}
              className={cn(ITEM_CLASS, active ? "text-emerald-700" : "text-slate-500")}
            >
              {content}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileBottomNav;