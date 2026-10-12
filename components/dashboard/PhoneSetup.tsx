"use client";
import AlphaUsageCard from './AlphaUsageCard';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Phone, ShieldCheck, RefreshCw } from 'lucide-react';
import AppShell from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Notice } from '@/components/ui/notice';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import {phoneApi,money,type PhoneSummary} from '@/lib/telephony/client-ui';
type InventoryNumber={e164:string;region:string;monthlyPriceMinor:number;setupPriceMinor:number};
const phaseLabels=['Verify identity','Choose number','Check testing credit','Activate'];
export default function PhoneSetup() {
  const [summary,setSummary]=useState<PhoneSummary|null>(null),[error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[inventory,setInventory]=useState<InventoryNumber[]>([]);
  const [reviewCount,setReviewCount]=useState(0),[hasMore,setHasMore]=useState(false);
  const [searched,setSearched]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [selected,setSelected]=useState<InventoryNumber|null>(null),[release,setRelease]=useState(false);
  const [usageError,setUsageError]=useState(false);
  const [usage,setUsage]=useState<Array<{id:string;started_at:string;duration_seconds:number|null;customer_charge_minor:string|null;billing_status:string}>>([]);
  const load=useCallback(async()=> {
    try { const data=await phoneApi('/api/telephony/account');setSummary(data);setError(null); }
    catch(e){setError(e instanceof Error?e.message:'Unable to load phone setup.');}
  },[]);
  useEffect(()=>{void load();},[load]);
  const run=async(work:()=>Promise<void>)=>{
    setBusy(true);setError(null);
    try{await work();}catch(e){setError(e instanceof Error?e.message:'Please try again.');}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    if(new URLSearchParams(window.location.search).get('verification')==='return') {
      window.history.replaceState(null,'','/dashboard/phone');
      void run(async()=>{setSummary(await phoneApi('/api/telephony/kyc',{}));});
    }
  // The provider redirect is a hint to reconcile, never a verification result.
  },[]);
  const number=summary?.numbers[0],account=summary?.account;
  const verified=account?.callsBlocked===false && account.status==='active';
  const active=number?.status==='active';
  const step=active?4:!verified?0:!number?1:number.provisioningStatus==='purchasing'?3:2;
  const searchInventory=async(nextPage=1)=>{
    const result=await phoneApi(`/api/telephony/numbers/search?search=${encodeURIComponent(search)}&page=${nextPage}`);
    setInventory(result.items);setPage(nextPage);setSearched(true);
    setReviewCount(Object.values(result.excluded??{}).reduce<number>((sum,value)=>sum+Number(value),0));
    setHasMore(result.hasMore??nextPage*25<result.total);
  };
  const start=async()=>{
    if(!account) setSummary(await phoneApi('/api/telephony/account',{}));
    const session=await phoneApi('/api/telephony/kyc/session',{});
    window.location.assign(session.url);
  };
  useEffect(()=>{
    if(!number?.id) return;
    let cancelled=false;
    setUsageError(false);
    void phoneApi('/api/telephony/usage').then(data=>{if(!cancelled)setUsage(data.items);}).catch(()=>{if(!cancelled)setUsageError(true);});
    return()=>{cancelled=true;};
  },[number?.id]);
  return <AppShell title="Phone" description="A dedicated number. Your assistant takes it from here." activeRoute="phone" routeMode contentWidth="narrow"
    actions={<Button variant="outline" size="sm" onClick={()=>void load()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button>}>
    <div className="space-y-8">
      <AlphaUsageCard compact/>
    {error && <Notice tone="error"><div role="alert">{error}<Button variant="ghost" size="sm" onClick={()=>void load()}>Try again</Button></div></Notice>}
      {!summary ? <div aria-label="Loading phone setup"><Skeleton className="h-10 w-48"/><Skeleton className="mt-6 h-52"/></div> : <>
        <ol aria-label="Phone setup progress" className="grid grid-cols-2 gap-3 border-b border-border pb-6 sm:grid-cols-4">
          {phaseLabels.map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className="flex items-center gap-2 text-xs sm:text-sm">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${step>i?'bg-primary text-white':step===i?'bg-primary-soft text-primary':'bg-muted text-muted-foreground'}`}>
              {step>i?<Check className="h-4 w-4"/>:i+1}</span><span>{label}</span></li>)}
        </ol>
        {summary.assistantConfigured===false && <Notice tone="info">{summary.assistantManaged ? 'Your organiser has not configured alpha AI yet. Contact them before activating phone calls.' : summary.assistantNeedsRepair ? 'Your saved AI key cannot be read. Re-save it in AI setup before activating phone calls.' : 'Connect your AI account before activating phone calls.'} <Link href="/dashboard/advanced" className="underline">Open AI setup</Link></Notice>}
        {!summary.phoneActivationApproved && <Notice tone="info">Phone activation needs approval from your Alpha operator. You can keep testing your assistant in the browser before identity verification.</Notice>}
        {!summary.browserTestCompleted && <Notice tone="info">Test your assistant in the browser before identity verification. <Link href="/dashboard" className="underline">Open your assistant</Link></Notice>}
        {!summary.configured && <Notice tone="info">Phone activation is opening soon. You can set up and test your assistant while we prepare your account.</Notice>}
        {!account && <section className="py-4">
          <Phone className="mb-5 h-8 w-8 text-primary" aria-hidden/>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Get your KeralAI number</h2>
          <p className="mt-3 max-w-lg text-muted-foreground">Your assistant can take calls when you’re busy, driving, asleep or unavailable. Get a dedicated Indian number and keep every conversation in one place.</p>
          <Button className="mt-6 w-full sm:w-auto" loading={busy} disabled={!summary.kycAvailable||!summary.phoneActivationApproved||!summary.browserTestCompleted} onClick={()=>void run(async()=>setSummary(await phoneApi('/api/telephony/account',{})))}>Get a phone number</Button>
        </section>}
        {account && !verified && <section className="py-2">
          <ShieldCheck className="mb-4 h-8 w-8 text-primary" aria-hidden/>
          <h2 className="font-display text-xl font-semibold">{account.kycStatus==='pending'?'Verification in progress':account.kycStatus==='failed'?'Let’s finish your verification':'Verify your identity'}</h2>
          {account.kycStatus==='pending'&&<p className="mt-3 text-sm text-muted-foreground">You can leave this page and return later. Check verification to refresh your status.</p>}
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">Identity verification is required to activate your Indian phone number. You’ll verify PAN and Aadhaar through DigiLocker on a secure verification page. KeralAI does not store your identity documents.</p>
          <ul className="my-5 space-y-3 text-sm">{['pan','aadhaar'].map(doc=><li key={doc} className="flex items-center justify-between border-b border-border pb-2">
            <span>{doc==='pan'?'PAN':'Aadhaar through DigiLocker'}</span><span className="capitalize text-muted-foreground">{account.documents[doc]?.replaceAll('_',' ') ?? 'Not started'}</span></li>)}</ul>
          {account.sessionExpiresAt && new Date(account.sessionExpiresAt)<new Date() && <Notice tone="warning">Your verification link expired. Continue below to open a new secure session.</Notice>}
          {['failed','session_revoked','revoked','cancelled','canceled','session_cancelled'].includes(account.sessionStatus ?? '') && <Notice tone="warning">Verification was not completed. You can restart securely below.</Notice>}
          {account.status!=='active' ? <Notice tone="warning">Your phone account needs review. Contact support to continue.</Notice> :
            <div className="flex flex-col gap-3 sm:flex-row"><Button loading={busy} disabled={!summary.phoneActivationApproved||!summary.browserTestCompleted||!summary.kycAvailable} onClick={()=>void run(start)}>Continue securely</Button>
              <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>setSummary(await phoneApi('/api/telephony/kyc',{})))}>Check verification</Button></div>}
        </section>}
        {verified && !number && <section>
          <div className="mb-6 flex items-center gap-2 text-sm text-primary"><ShieldCheck className="h-5 w-5"/>Identity verified. You’re ready to choose a number.</div>
          <h2 className="font-display text-xl font-semibold">Choose your number</h2>
          <p className="mt-2 text-sm text-muted-foreground">Numbers come from live availability. Your final selection is confirmed at activation.</p>
          <form className="my-6 flex flex-col items-end gap-3 sm:flex-row" onSubmit={e=>{e.preventDefault();void run(()=>searchInventory());}}>
            <Field label="Search by digits" className="w-full">{props=><Input {...props} inputMode="tel" value={search} maxLength={16} onChange={e=>setSearch(e.target.value.replace(/[^+0-9]/g,''))} placeholder="For example, 80"/>}</Field>
            <Button type="submit" className="w-full sm:w-auto" loading={busy}>Find numbers</Button>
          </form>
          {searched && reviewCount>0 && <Notice tone="info">{reviewCount} {reviewCount===1?'number needs':'numbers need'} operator review for pricing or availability on this page. Your organiser can check the funding policy.</Notice>}
          {searched && inventory.length===0 && <Notice tone="info">{reviewCount>0?'No numbers on this page meet the approved phone policy. Try the next page or contact your organiser.':'No numbers matched. Try fewer digits or check again later.'}</Notice>}
          <ul className="divide-y divide-border">{inventory.map(item=><li key={item.e164} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div><p className="text-lg font-semibold tabular-nums">{item.e164}</p><p className="text-xs text-muted-foreground">{item.region || 'India'} · {money(item.monthlyPriceMinor)}/month</p></div>
            <Button variant="outline" onClick={()=>setSelected(item)} disabled={busy}>Choose</Button></li>)}</ul>
          {searched && <div className="mt-5 flex items-center justify-between"><Button variant="ghost" disabled={page===1||busy} onClick={()=>void run(()=>searchInventory(page-1))}>Previous</Button><span className="text-xs text-muted-foreground">Page {page}</span><Button variant="ghost" disabled={!hasMore||busy} onClick={()=>void run(()=>searchInventory(page+1))}>Next</Button></div>}
        </section>}
        {number && <section>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
            <div><p className="mb-2 text-sm text-muted-foreground">Your assistant’s number</p><h2 className="break-all font-display text-2xl font-semibold tabular-nums sm:text-3xl">{number.e164}</h2></div>
            <span className={`rounded-full px-3 py-1.5 text-sm ${active?'bg-primary-soft text-primary':'bg-warning-soft text-warning'}`}>{number.status.replaceAll('_',' ')}</span>
          </div>
          {active ? <dl className="mt-6 grid grid-cols-2 gap-y-5 text-sm"><dt className="text-muted-foreground">Incoming calls</dt><dd className="text-right">{summary.phoneCallsReady?'Ready — testing limits apply':`Paused — ${summary.phoneReadinessReason||'check verification, testing credit or setup'}`}</dd><dt className="text-muted-foreground">Number rental</dt><dd className="text-right">{money(number.monthlyPriceMinor)}/month</dd></dl> : <div className="mt-6 space-y-4">
            <h3 className="font-semibold">{number.status==='releasing'?'Release is being confirmed':number.status==='suspended'?'Your number is paused':'Setting up your number'}</h3>
            {number.status==='releasing' && <p className="text-sm text-muted-foreground">Calls are paused. Provider release can take at least 24 hours; this number remains on your account until removal is confirmed.</p>}
            <ol className="space-y-2 text-sm"><li>{['purchasing','purchase_unknown'].includes(number.provisioningStatus)?'Confirming reservation…':'✓ Number reserved'}</li><li>{number.provisioningStatus==='active'?'✓ Assistant connected':'Assistant connection pending'}</li><li>Inbound calls activate after all checks pass.</li></ol>
            {!['suspended','releasing'].includes(number.status) && <Button loading={busy} onClick={()=>void run(async()=>setSummary(await phoneApi('/api/telephony/numbers/retry',{id:number.id})))}>{number.provisioningStatus==='purchase_unknown'?'Check setup':'Retry setup'}</Button>}
            {number.status==='suspended' && <p className="text-sm text-muted-foreground">Ask your Alpha operator to review testing credit and resume your number.</p>}
          </div>}
          <Button variant="ghost" size="sm" className="mt-6 text-muted-foreground" onClick={()=>setRelease(true)} disabled={busy||number.releaseRequested}>{number.releaseRequested?'Release requested':'Request release'}</Button>
        </section>}
        <section className="border-t border-border pt-6">
          <h2 className="font-display text-lg font-semibold">KeralAI testing credit</h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-2xl font-semibold tabular-nums">{money(summary.wallet.availableMinor)}</p><Link href="/dashboard/billing" className="text-sm font-medium text-primary underline underline-offset-4">Balance & usage</Link></div>
          {summary.wallet.heldMinor>0 && <p className="mt-2 text-sm text-muted-foreground">{money(summary.wallet.heldMinor)} reserved for phone setup or an ongoing call. Charges appear after confirmation.</p>}
          {summary.wallet.availableMinor<=0 && <Notice tone="warning" className="mt-4">Ask your Alpha operator for sponsored testing credit to activate calls. No payment is required.</Notice>}
        </section>
        {number && <section className="border-t border-border pt-6"><h2 className="mb-4 font-display text-lg font-semibold">Recent phone usage</h2>{usageError?<Notice tone="error">Usage could not be loaded. Refresh to try again.</Notice>:usage.length===0?<p className="text-sm text-muted-foreground">No calls yet. Once your number is active, calls will appear here.</p>:<ul className="divide-y divide-border">{usage.map(call=><li key={call.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span>{new Date(call.started_at).toLocaleString('en-IN')}</span><span>{call.duration_seconds??'—'} sec · {call.customer_charge_minor!==null?money(Number(call.customer_charge_minor)):'Confirming usage'}</span></li>)}</ul>}</section>}
      </>}
    </div>
    <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}} title="Activate your number" description={selected?.e164} size="sm"
      footer={<><Button variant="outline" disabled={busy} onClick={()=>setSelected(null)}>Cancel</Button><Button loading={busy} disabled={!selected || !summary || !summary.assistantConfigured || summary.wallet.availableMinor<(selected.monthlyPriceMinor+selected.setupPriceMinor)} onClick={()=>void run(async()=>{
        const item=selected!;const key=crypto.randomUUID();setSummary(await phoneApi('/api/telephony/numbers/purchase',{e164:item.e164},key));setSelected(null);
      })}>Activate number</Button></>}>
      {selected && <div className="space-y-4 text-sm"><p>Monthly rental {money(selected.monthlyPriceMinor)}. One-time setup {money(selected.setupPriceMinor)}.</p><p className="font-medium">Testing credit used on activation: {money(selected.monthlyPriceMinor+selected.setupPriceMinor)}</p><p className="text-muted-foreground">Balance is reserved while we connect your assistant. Charges are confirmed after setup succeeds.</p>{summary && summary.wallet.availableMinor<selected.monthlyPriceMinor+selected.setupPriceMinor && <Notice tone="warning">Ask your Alpha operator for testing credit. <Link href="/dashboard/billing" className="underline">Open balance</Link></Notice>}{error&&<Notice tone="error">{error}</Notice>}</div>}
    </Dialog>
    <Dialog open={release} onOpenChange={setRelease} title="Request number release?" description="Your operator will review release fees, commitments and recovery options. This request does not release the number or change incoming calls." size="sm"
      footer={<><Button variant="outline" disabled={busy} onClick={()=>setRelease(false)}>Keep number</Button><Button variant="destructive" loading={busy} onClick={()=>void run(async()=>{setSummary(await phoneApi('/api/telephony/numbers/release',{id:number!.id}));setRelease(false);})}>Request operator review</Button></>}>
      <p className="break-all text-lg font-semibold">{number?.e164}</p>{error&&<Notice tone="error">{error}</Notice>}
    </Dialog>
  </AppShell>;
}
