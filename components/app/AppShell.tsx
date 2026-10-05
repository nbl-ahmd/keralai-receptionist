"use client";

import Link from "next/link";
import type { Route } from "next";
import { LogOut, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { cn } from "@/lib/utils";
import {
  MANAGE_ITEMS,
  MOBILE_TABS,
  NAV_ITEMS,
  type DashboardTab,
  type ManagedRoute,
} from "@/components/app/navigation";
import {
  AttentionProvider,
  CountBadge,
  NotificationBell,
  useAttention,
} from "@/components/app/attention";

export interface WorkspaceStatus {
  configured: boolean;
  modeLabel: string;
  modeActive: boolean;
  modeExpiresAt?: string | null;
}

export interface AppShellProps {
  title: string;
  description?: string;
  eyebrow?: string;
  /** Active assistant tab (dashboard) — omit on route pages. */
  activeTab?: DashboardTab;
  /** Active route destination (settings/inbox/performance). */
  activeRoute?: ManagedRoute;
  onSelectTab?: (tab: DashboardTab) => void;
  /** Route pages link tabs as `/dashboard#tab` instead of switching in place. */
  routeMode?: boolean;
  status?: WorkspaceStatus;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  lastSynced?: Date | null;
  onSignOut?: () => void;
  /** `narrow` constrains settings-style pages to a readable column. */
  contentWidth?: "default" | "narrow";
  children: React.ReactNode;
}

function BrandMark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="KeralAI home"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-xs">
        KA
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-sm font-semibold tracking-tight text-foreground">
          KeralAI
        </span>
        <span className="block text-2xs text-muted-foreground">AI receptionist</span>
      </span>
    </Link>
  );
}

function SidebarLink({
  href,
  active,
  icon: Icon,
  label,
  description,
  badge,
}: {
  href: string;
  active: boolean;
  icon: typeof NAV_ITEMS[number]["icon"];
  label: string;
  description?: string;
  badge?: number;
}) {
  return (
    <Link
      href={href as Route}
      aria-current={active ? "page" : undefined}
      aria-label={badge ? `${label}, ${badge} need attention` : undefined}
      className={cn(
        "group flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary-soft text-primary-soft-foreground"
          : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
      )}
    >
      <Icon
        className={cn("mt-0.5 h-4.5 w-4.5 shrink-0", active ? "text-primary" : "text-slate-400 group-hover:text-slate-500")}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="block font-medium">{label}</span>
          {badge ? <CountBadge count={badge} /> : null}
        </span>
        {description && <span className="mt-0.5 block text-2xs leading-snug opacity-80">{description}</span>}
      </span>
    </Link>
  );
}

export function AppShellFrame({
  title,
  description,
  eyebrow,
  activeTab,
  activeRoute,
  onSelectTab,
  routeMode = false,
  status,
  actions,
  onRefresh,
  refreshing,
  lastSynced,
  onSignOut,
  contentWidth = "default",
  children,
}: AppShellProps) {
  const { counts } = useAttention();

  return (
    <div className="min-h-app bg-background">
      <div className="mx-auto flex w-full max-w-[1440px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-app w-[264px] shrink-0 flex-col border-r border-border bg-card/60 px-3 py-4 lg:flex">
          <div className="px-1">
            <BrandMark />
          </div>

          <nav className="mt-6 flex-1 space-y-6 overflow-y-auto" aria-label="Workspace">
            <div>
              <p className="px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Assistant
              </p>
              <div className="mt-2 space-y-0.5">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelectTab?.(item.key)}
                    aria-current={activeTab === item.key ? "page" : undefined}
                    aria-label={
                      item.key === "calls" && counts.missedCalls > 0
                        ? `${item.label}, ${counts.missedCalls} missed calls`
                        : undefined
                    }
                    className={cn(
                      "group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      activeTab === item.key
                        ? "bg-primary-soft text-primary-soft-foreground"
                        : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "mt-0.5 h-4.5 w-4.5 shrink-0",
                        activeTab === item.key ? "text-primary" : "text-slate-400 group-hover:text-slate-500",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block font-medium">{item.label}</span>
                        {item.key === "calls" ? <CountBadge count={counts.missedCalls} /> : null}
                      </span>
                      <span className="mt-0.5 block text-2xs leading-snug opacity-80">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="px-3 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Manage
              </p>
              <div className="mt-2 space-y-0.5">
                {MANAGE_ITEMS.map((item) => (
                  <SidebarLink
                    key={item.key}
                    href={item.href}
                    active={activeRoute === item.key}
                    icon={item.icon}
                    label={item.label}
                    description={item.description}
                    badge={item.key === "inbox" ? counts.inbox : 0}
                  />
                ))}
              </div>
            </div>
          </nav>

          {status && (
            <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
              <StatusIndicator
                tone={status.configured ? "online" : "warning"}
                label={status.configured ? "Assistant configured" : "Setup needed"}
              />
              <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                {status.configured
                  ? "New calls use your saved details."
                  : "Add your details so the assistant can answer."}
              </p>
            </div>
          )}

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="mt-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4.5 w-4.5" />
              Sign out
            </button>
          )}
        </aside>

        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="min-w-0 flex-1">
                {eyebrow && (
                  <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="truncate font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {title}
                  </h1>
                  {status && (
                    <>
                      <Badge variant={status.configured ? "success" : "warning"} className="hidden sm:inline-flex">
                        {status.configured ? "Configured" : "Setup needed"}
                      </Badge>
                      <Badge variant={status.modeActive ? "warning" : "secondary"} className="hidden sm:inline-flex">
                        {status.modeLabel}
                      </Badge>
                    </>
                  )}
                </div>
                {description && (
                  <p className="mt-0.5 hidden truncate text-sm text-muted-foreground sm:block">{description}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {lastSynced && (
                  <span className="hidden text-xs text-muted-foreground xl:block">
                    Synced {lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {onRefresh && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRefresh}
                    disabled={refreshing}
                    aria-label="Refresh data"
                    title="Refresh"
                  >
                    <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                  </Button>
                )}
                <NotificationBell />
                {actions}
                {onSignOut && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onSignOut}
                    aria-label="Sign out"
                    title="Sign out"
                    className="lg:hidden"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Mobile tab strip for the extra assistant sections */}
            {!routeMode && onSelectTab && (
              <nav
                className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2.5 sm:px-6 lg:hidden"
                aria-label="Assistant sections"
              >
                {NAV_ITEMS.filter((item) => !["overview", "calls", "knowledge"].includes(item.key)).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelectTab(item.key)}
                    aria-current={activeTab === item.key ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      activeTab === item.key
                        ? "border-primary/20 bg-primary-soft text-primary-soft-foreground"
                        : "border-border bg-card text-muted-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </nav>
            )}
          </header>

          <main
            className={cn(
              "flex-1 px-4 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1.5rem)] pt-5 sm:px-6 lg:px-8 lg:pb-12",
              contentWidth === "narrow" && "mx-auto w-full max-w-3xl",
            )}
          >
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-lg lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_TABS.map((item) => {
            const active = item.kind === "tab" ? activeTab === item.key : activeRoute === item.key;
            const badge =
              item.kind === "route"
                ? item.key === "inbox"
                  ? counts.inbox
                  : 0
                : item.key === "calls"
                  ? counts.missedCalls
                  : 0;
            const icon = (
              <span className="relative">
                <item.icon className={cn("h-5 w-5", active ? "text-primary" : "text-slate-400")} />
                {badge > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold tabular-nums text-destructive-foreground ring-2 ring-card">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
            );
            const ariaLabel = badge > 0 ? `${item.label}, ${badge} need attention` : undefined;
            const classes = cn(
              "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              active ? "text-primary-soft-foreground" : "text-muted-foreground",
            );

            if (item.kind === "route") {
              const href = MANAGE_ITEMS.find((manage) => manage.key === item.key)?.href ?? "/dashboard";
              return (
                <Link
                  key={item.key}
                  href={href as Route}
                  aria-current={active ? "page" : undefined}
                  aria-label={ariaLabel}
                  className={classes}
                >
                  {icon}
                  {item.label}
                </Link>
              );
            }

            if (routeMode) {
              return (
                <Link
                  key={item.key}
                  href={`/dashboard#${item.key}` as Route}
                  aria-current={active ? "page" : undefined}
                  aria-label={ariaLabel}
                  className={classes}
                >
                  {icon}
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelectTab?.(item.key as DashboardTab)}
                aria-current={active ? "page" : undefined}
                aria-label={ariaLabel}
                className={classes}
              >
                {icon}
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/**
 * Wraps every workspace page in the attention provider so navigation badges,
 * the header bell and the dashboard banner all read from one source of truth.
 */
export function AppShell(props: AppShellProps) {
  return (
    <AttentionProvider>
      <AppShellFrame {...props} />
    </AttentionProvider>
  );
}

export default AppShell;
