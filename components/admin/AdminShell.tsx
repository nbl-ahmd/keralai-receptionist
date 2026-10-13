"use client";
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { ArrowLeft, LayoutDashboard, Users, SlidersHorizontal, ShieldCheck, History } from 'lucide-react';
import { cn } from '@/lib/utils';

const sections = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, description: 'Platform activity and service status' },
  { href: '/admin/workspaces', label: 'Workspaces', icon: Users, description: 'Accounts, verification and recovery' },
  { href: '/admin/operations', label: 'Operations', icon: SlidersHorizontal, description: 'Invitations, allowances and controls' },
  { href: '/admin/providers', label: 'Providers', icon: ShieldCheck, description: 'Deployment and calling readiness' },
  { href: '/admin/audit', label: 'Audit log', icon: History, description: 'Recorded operator actions' },
];
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const current = sections.find(section => section.href === path) ?? sections[0];
  return <div className="min-h-app bg-slate-50 text-slate-900">
    <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:p-3 focus:ring-2 focus:ring-primary">Skip to content</a>
    <div className="mx-auto flex min-h-app max-w-[1600px]">
      <aside className="sticky top-0 hidden h-app w-60 shrink-0 flex-col bg-slate-950 px-4 py-6 text-slate-100 lg:flex">
        <Link href="/admin" className="flex min-h-11 items-center gap-3 rounded-lg px-2 focus-visible:ring-2 focus-visible:ring-emerald-400"><ShieldCheck className="h-6 w-6 text-emerald-400"/><span><span className="block font-display font-semibold">KeralAI</span><span className="text-xs text-slate-400">Administration</span></span></Link>
        <nav aria-label="Administration" className="mt-10 flex-1 space-y-1">{sections.map(section => <Link key={section.href} href={section.href as Route} aria-current={path===section.href?'page':undefined}
          className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400',path===section.href?'bg-emerald-400/15 text-emerald-300':'text-slate-300 hover:bg-slate-800 hover:text-white')}><section.icon className="h-4 w-4"/>{section.label}</Link>)}</nav>
        <p className="mb-4 px-3 text-xs leading-relaxed text-slate-400">Operator access. Changes require a recorded reason.</p>
        <Link href="/dashboard" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400"><ArrowLeft className="h-4 w-4"/>Back to workspace</Link>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-7 lg:px-10"><div><p className="text-xs font-medium text-muted-foreground lg:hidden">KeralAI administration</p><h1 className="font-display text-xl font-semibold sm:text-2xl">{current.label}</h1><p className="mt-1 text-sm text-muted-foreground">{current.description}</p></div><Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary"><ArrowLeft className="h-4 w-4"/>Workspace</Link></div>
          <nav aria-label="Administration mobile" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 lg:hidden">{sections.map(section => <Link key={section.href} href={section.href as Route} aria-current={path===section.href?'page':undefined}
            className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary',path===section.href?'font-semibold text-primary':'text-muted-foreground')}><section.icon className="h-4 w-4"/>{section.label}</Link>)}</nav>
        </header>
        <main id="admin-content" className="p-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] sm:p-7 lg:p-10">{children}</main>
      </div>
    </div>
  </div>;
}
