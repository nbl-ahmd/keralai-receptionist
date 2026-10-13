"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { phoneApi, money } from '@/lib/telephony/client-ui';
interface Snapshot { controls: { browser_enabled: boolean; phone_enabled: boolean; purchase_enabled: boolean };
  metrics: { active_browser: number; active_phone: number; today_seconds: string; pending_settlements: number;
    oldest_pending_seconds: number; provider_actual_minor: string; ai_estimated_minor: string; request_ai_estimated_minor: string } }
export default function AdminOverview() {
  const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setBusy(true);try{setData(await phoneApi('/api/admin/alpha'));setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load platform activity.');}finally{setBusy(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const metrics=data?.metrics;
  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-muted-foreground">Monitor your platform, review issues, and open the controls you need. Customer workspace access stays separate from operator authority.</p><Button variant="outline" loading={busy} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button></div>
    {error&&<Notice tone="error">{error}</Notice>}
    <section aria-label="Platform activity" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Active sessions',metrics?String(metrics.active_browser+metrics.active_phone):null,'Browser and phone sessions now'],
      ['Voice usage today',metrics?`${Math.ceil(Number(metrics.today_seconds)/60)} min`:null,'Recorded usage for the current UTC day'],
      ['Pending settlements',metrics?String(metrics.pending_settlements):null,'Calls awaiting authoritative billing'],
      ['Carrier spend',metrics?money(Number(metrics.provider_actual_minor)):null,'Recorded provider cost this month'],
    ].map(([label,value,hint])=><div key={label} className="bg-white p-4 sm:p-6"><p className="text-sm font-medium text-slate-600">{label}</p>{value===null?<Skeleton className="my-3 h-8 w-20"/>:<p className="my-3 break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>}<p className="text-xs leading-relaxed text-muted-foreground">{hint}</p></div>)}</section>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="font-display text-lg font-semibold">Service controls</h2><p className="mt-1 text-sm text-muted-foreground">Configured availability, separate from provider readiness.</p><ul className="mt-5 divide-y divide-slate-100">{([['browser_enabled','Browser voice'],['phone_enabled','New phone calls'],['purchase_enabled','Number purchases']] as const).map(([key,label])=><li key={key} className="flex items-center justify-between gap-4 py-4"><span className="text-sm font-medium">{label}</span><Badge variant={data?.controls[key]?'success':'secondary'}>{data?data.controls[key]?'Enabled':'Paused':'Loading'}</Badge></li>)}</ul><Button asChild variant="outline" className="mt-4"><Link href="/admin/operations">Manage controls<ArrowUpRight className="h-4 w-4"/></Link></Button></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="font-display text-lg font-semibold">Needs attention</h2>{metrics?<><p className="mt-5 text-sm leading-relaxed">{metrics.pending_settlements?`${metrics.pending_settlements} call settlements are pending. Oldest: ${Math.ceil(metrics.oldest_pending_seconds/60)} minutes.`:'No pending call settlements reported.'}</p><p className="mt-4 text-sm text-muted-foreground">Reserved AI estimate: {money(Number(metrics.ai_estimated_minor)+Number(metrics.request_ai_estimated_minor))}. This is an allowance estimate, not an actual provider invoice.</p></>:<Skeleton className="mt-5 h-20"/>}<div className="mt-6 flex flex-wrap gap-3"><Button asChild variant="outline"><Link href="/admin/workspaces">Review workspaces</Link></Button><Button asChild variant="ghost"><Link href="/admin/providers">Check providers</Link></Button></div></section>
    </div>
    <section className="grid gap-4 sm:grid-cols-2">{[{href:'/admin/operations',title:'Invite and manage testers',text:'Manage invitations, per-workspace allowances and recorded app credit.'},{href:'/admin/audit',title:'Review operator history',text:'Inspect who changed controls, when they changed, and the recorded reason.'}].map(item=><Link key={item.href} href={item.href as Route} className="group rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-emerald-300 focus-visible:ring-2 focus-visible:ring-primary"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{item.title}</h2><ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary"/></div><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p></Link>)}</section>
  </div>;
}
