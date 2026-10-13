"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Users, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import TelephonyReadiness from '@/components/dashboard/TelephonyReadiness';
import ExistingVoiceLinkClientLink from '@/components/dashboard/ExistingVoiceLinkClientLink';
import { phoneApi, money } from '@/lib/telephony/client-ui';

interface Tenant {
  provider: string; provider_username: string | null;
  checkout: null | { id: string; state: string; e164: string; code: string | null; checkedAt: string | null; orderId: string | null };
  id: string; name: string; status: string; provider_auth_id: string | null; kyc_status: string | null;
  kyc_calls_blocked: boolean | null; account_status: string | null; account_error: string | null;
  number_id: string | null; e164: string | null; number_status: string | null; provisioning_status: string | null;
  error_code: string | null; balance_minor: string; pending_calls: number; failed_calls: number;
  recent_usage: Array<{ provider_call_id: string; call_status: string; billing_status: string; duration_seconds: number | null }>;
}
export default function AdminWorkspaces() {
  const [items, setItems] = useState<Tenant[]>([]), [page, setPage] = useState(1), [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'), [loading, setLoading] = useState(true), [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false), [selected, setSelected] = useState<Tenant | null>(null), [reason, setReason] = useState('');
  const [credit, setCredit] = useState(false), [amount, setAmount] = useState(''), [reference, setReference] = useState('');
  const [draft, setDraft] = useState(false), [confirmedClosed, setConfirmedClosed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await phoneApi(`/api/admin/telephony?page=${page}`); setItems(data.items); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not load workspaces.'); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => items.filter(t => (filter === 'all' || t.provider === filter) &&
    `${t.name} ${t.id} ${t.e164 ?? ''}`.toLowerCase().includes(search.toLowerCase())), [items, filter, search]);
  const current = selected ? items.find(t => t.id === selected.id && t.provider === selected.provider) ?? selected : null;
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!current || busy) return;
    setBusy(true); setError(''); setSuccess('');
    try { await phoneApi('/api/admin/telephony', { tenantId: current.id, numberId: current.number_id, provider: current.provider, action, reason, ...extra });
      await load(); setCredit(false); setDraft(false); setSuccess('Operation completed and recorded.'); }
    catch (error) { setError(error instanceof Error ? error.message : 'Operation failed.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-6">
    {error && <Notice tone="error">{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-sm text-muted-foreground">Find a workspace, then open its account details and operator actions. Balances are shown in rupees.</p><Button variant="outline" loading={loading} onClick={() => void load()}><RefreshCw className="h-4 w-4"/>Refresh</Button></div>
    <div className="grid gap-4 sm:grid-cols-3">
      {[['Workspaces on this page', new Set(items.map(t => t.id)).size], ['Accounts needing review', items.filter(t => t.account_error || t.error_code || t.account_status === 'needs_review').length], ['Pending settlements on this page', items.reduce((n, t) => n + Number(t.pending_calls), 0)]].map(([label, value]) => <div key={label} className="border-l-2 border-slate-300 bg-white px-5 py-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}
    </div>
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 p-4 sm:p-5"><div className="min-w-0 flex-1"><Field label="Search this page">{props => <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"/><Input {...props} className="pl-9" placeholder="Workspace, ID or phone number" value={search} onChange={e => setSearch(e.target.value)}/></div>}</Field></div><label className="text-sm font-medium">Provider<select aria-label="Filter provider" value={filter} onChange={e => setFilter(e.target.value)} className="mt-2 block min-h-11 rounded-lg border border-border bg-white px-3 text-sm"><option value="all">All providers</option><option value="vobiz">Vobiz</option><option value="voicelink">VoiceLink</option></select></label></div>
      {loading && !items.length ? <div className="space-y-3 p-5"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div> : !visible.length ? <div className="px-5 py-12 text-center"><Users className="mx-auto h-7 w-7 text-slate-400"/><p className="mt-3 font-medium">No matching workspaces</p><p className="mt-1 text-sm text-muted-foreground">Change your search or move to another page.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs text-muted-foreground"><tr>{['Workspace', 'Provider', 'Identity', 'App balance', 'Pending', ''].map((label,i) => <th key={i} scope="col" className="px-5 py-3 font-medium">{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{visible.map(t => <tr key={`${t.id}:${t.provider}`} className="hover:bg-slate-50/70"><td className="px-5 py-4"><p className="font-semibold">{t.name}</p><p className="mt-1 text-xs text-muted-foreground">{t.e164 ?? 'No phone number'}</p></td><td className="px-5 py-4">{t.provider === 'voicelink' ? 'VoiceLink' : 'Vobiz'}</td><td className="px-5 py-4"><Badge variant={t.kyc_calls_blocked === false ? 'success' : 'secondary'}>{t.kyc_status ?? 'Not started'}</Badge></td><td className="px-5 py-4 tabular-nums">{money(Number(t.balance_minor))}</td><td className="px-5 py-4 tabular-nums">{t.pending_calls}</td><td className="px-5 py-3"><Button size="sm" variant="ghost" className="min-h-11" onClick={() => { setSelected(t); setReason(''); setError(''); }}>Manage<span className="sr-only"> {t.name}</span><ChevronRight className="h-4 w-4"/></Button></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3"><Button variant="ghost" disabled={page === 1 || loading || busy} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm text-muted-foreground">Page {page}</span><Button variant="ghost" disabled={loading || busy || new Set(items.map(t => t.id)).size < 25} onClick={() => setPage(p => p + 1)}>Next</Button></div>
    </section>
    <Sheet open={!!current} onOpenChange={open => { if (!open && !busy) setSelected(null); }} title={current?.name ?? 'Workspace'} description="Account details and recorded operator actions" className="max-w-xl">
      {current && <div className="space-y-6">
        <dl className="grid grid-cols-2 gap-3 text-sm"><dt className="text-muted-foreground">Provider</dt><dd>{current.provider}</dd><dt className="text-muted-foreground">Identity</dt><dd>{current.kyc_status ?? 'Not started'}</dd><dt className="text-muted-foreground">Provider account</dt><dd className="break-all">{current.provider_auth_id ?? 'Not connected'}</dd><dt className="text-muted-foreground">App balance</dt><dd>{money(Number(current.balance_minor))}</dd><dt className="text-muted-foreground">Phone number</dt><dd>{current.e164 ?? 'Not assigned'}</dd><dt className="text-muted-foreground">Number setup</dt><dd>{current.provisioning_status ?? 'Not started'}</dd></dl>
        <p className="break-all text-xs text-muted-foreground">Workspace ID: {current.id}</p>
        {(current.error_code || current.account_error) && <Notice tone="warning">{current.error_code || current.account_error}</Notice>}
        {current.provider === 'vobiz' ? <TelephonyReadiness tenantId={current.id}/> : <Notice tone="info">VoiceLink calling requires verified provider authentication, live call lookup and carrier controls.</Notice>}
        {current.checkout && <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm"><h3 className="font-semibold">Saved checkout</h3><p>{current.checkout.e164} · {current.checkout.state}</p><p className="break-all text-xs text-muted-foreground">Order {current.checkout.orderId ?? 'unknown'} · {current.checkout.code ?? 'Not reconciled'}</p></div>}
        <Field label="Operator reason" hint="Required and recorded for every account change.">{props => <Input {...props} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}/>}</Field>
        <div className="flex flex-wrap gap-2"><Button variant="outline" loading={busy} disabled={!reason.trim() || !current.provider_auth_id} onClick={() => void act('sync_kyc')}>Sync verification</Button><ExistingVoiceLinkClientLink tenantId={current.id} name={current.name} disabled={busy || (current.provider === 'voicelink' && !!current.provider_auth_id)} reason={reason} onLinked={load}/>
          {current.provider === 'voicelink' && <><Button variant="outline" disabled={busy || !reason.trim() || !current.checkout} onClick={() => void act('reconcile_voicelink_checkout')}>Check saved checkout</Button><Button variant="outline" disabled={busy || !reason.trim() || !!current.provider_auth_id || !current.provider_username} onClick={() => void act('reconcile_voicelink_account')}>Recover original client</Button>{current.checkout && ['creating','draft_unknown','quoted'].includes(current.checkout.state) && <Button variant="outline" disabled={busy || !reason.trim()} onClick={() => { setDraft(true); setReference(''); setConfirmedClosed(false); }}>Resolve closed draft</Button>}</>}
          {current.number_id && <><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act('retry_number')}>Retry setup</Button><Button variant="outline" disabled={busy || !reason.trim()} onClick={() => void act(current.number_status === 'suspended' ? 'resume_number' : 'suspend_number')}>{current.number_status === 'suspended' ? 'Resume number' : 'Suspend number'}</Button></>}
          <Button disabled={busy || !reason.trim()} onClick={() => { setCredit(true); setAmount(''); setReference(''); }}>Grant app credit</Button>
        </div>
        <details className="rounded-lg border border-border p-4"><summary className="min-h-11 cursor-pointer font-medium text-sm">Recent call states</summary><ul className="space-y-3 text-xs text-muted-foreground">{current.recent_usage.length ? current.recent_usage.map(u => <li key={u.provider_call_id} className="break-all">{u.provider_call_id} · {u.call_status} · {u.billing_status} · {u.duration_seconds ?? '—'} seconds</li>) : <li>No recent call records.</li>}</ul></details>
        {error && <Notice tone="error">{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
      </div>}
    </Sheet>
    <Dialog open={credit} onOpenChange={open => { if (!busy) setCredit(open); }} title="Grant app credit" description="A recorded account adjustment, not a payment or provider wallet transfer." size="sm" footer={<><Button variant="outline" disabled={busy} onClick={() => setCredit(false)}>Cancel</Button><Button loading={busy} disabled={!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || !/^[a-zA-Z0-9_-]{16,100}$/.test(reference) || !reason.trim()} onClick={() => void act('credit', { amountMinor: Math.round(Number(amount) * 100), reference })}>Record {money(Math.round((Number(amount) || 0) * 100))} credit</Button></>}>
      <div className="space-y-4"><Field label="Amount (₹)">{props => <Input {...props} value={amount} inputMode="decimal" onChange={e => setAmount(e.target.value)} placeholder="For example, 500.00"/>}</Field><Field label="Operation reference" hint="Keep this reference when retrying the same credit.">{props => <Input {...props} value={reference} onChange={e => setReference(e.target.value)} maxLength={100}/>}</Field>{error && <Notice tone="error">{error}</Notice>}</div>
    </Dialog>
    <Dialog open={draft} onOpenChange={open => { if (!busy) setDraft(open); }} title="Resolve an unpaid provider draft" description="Record local closure only after VoiceLink confirms this draft is closed and unpaid." size="sm" footer={<><Button variant="outline" disabled={busy} onClick={() => setDraft(false)}>Cancel</Button><Button disabled={!confirmedClosed || !reference || !reason.trim()} loading={busy} onClick={() => void act('close_voicelink_draft', { reference, providerDraftClosed: confirmedClosed })}>Record draft closure</Button></>}>
      <div className="space-y-4"><Field label="Provider or support reference">{props => <Input {...props} value={reference} onChange={e => setReference(e.target.value)} maxLength={100}/>}</Field><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmedClosed} onChange={e => setConfirmedClosed(e.target.checked)}/>VoiceLink confirmed the original draft is closed and unpaid.</label>{error && <Notice tone="error">{error}</Notice>}</div>
    </Dialog>
  </div>;
}
