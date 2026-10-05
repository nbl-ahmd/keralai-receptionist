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

export type DashboardTab = "overview" | "calls" | "knowledge" | "instructions" | "voice";
export type ManagedRoute = "inbox" | "settings" | "performance";

export interface NavItem {
  key: DashboardTab;
  label: string;
  /** Short helper shown in the sidebar / tooltips. */
  description: string;
  icon: typeof LayoutDashboard;
}

/** Primary assistant sections, shown as in-page tabs inside the dashboard. */
export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", description: "Workspace status and recent activity", icon: LayoutDashboard },
  { key: "calls", label: "Calls", description: "History, transcripts and outcomes", icon: PhoneCall },
  { key: "knowledge", label: "Knowledge", description: "What the assistant can reference", icon: BookOpen },
  { key: "instructions", label: "Instructions", description: "Temporary behaviour for new calls", icon: Zap },
  { key: "voice", label: "Voice", description: "How the assistant sounds", icon: Mic },
];

export interface ManageItem {
  key: ManagedRoute;
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}

/** Route-based destinations that sit outside the tab set. */
export const MANAGE_ITEMS: ManageItem[] = [
  { key: "inbox", href: "/dashboard/crm", label: "Inbox", description: "Messages, callbacks and bookings", icon: Inbox },
  { key: "settings", href: "/dashboard/settings", label: "Settings", description: "Workspace, voice and providers", icon: Settings2 },
  { key: "performance", href: "/dashboard/performance", label: "Performance", description: "Call latency and throughput", icon: Gauge },
];

/**
 * The five destinations that fit comfortably in a phone tab bar. Everything
 * else is reachable from Overview or the sidebar, so nothing is more than two
 * taps away. Each tab is at least 56px tall for touch comfort.
 */
export const MOBILE_TABS: Array<
  | { kind: "tab"; key: DashboardTab; label: string; icon: typeof LayoutDashboard }
  | { kind: "route"; key: ManagedRoute; label: string; icon: typeof LayoutDashboard }
> = [
  { kind: "tab", key: "overview", label: "Overview", icon: LayoutDashboard },
  { kind: "tab", key: "calls", label: "Calls", icon: PhoneCall },
  { kind: "tab", key: "knowledge", label: "Knowledge", icon: BookOpen },
  { kind: "route", key: "inbox", label: "Inbox", icon: Inbox },
  { kind: "route", key: "settings", label: "Settings", icon: Settings2 },
];
