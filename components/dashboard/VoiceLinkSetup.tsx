"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import PhoneProviderChoice from './PhoneProviderChoice';
import { money, phoneApi, type PhoneSummary } from '@/lib/telephony/client-ui';
import type { voiceLinkStatus } from '@/lib/telephony/providers/voicelink/status';

type Status = ReturnType<typeof voiceLinkStatus>;
type Checkout = { id: string; e164: string; state: string; expiresAt: string | null;
  quote: null | { totalMinor: number; monthlyMinor: number; autoRenew: true };
  customerPrice: null | { monthlyMinor: number; setupMinor: number; initialChargeMinor: number };
  terms: null | { reference: string; releaseMinor: number; commitmentMonths: number };
  recoveryMessage?: string | null; recoveryCheckedAt?: string | null; confirmationAvailable: boolean; confirmationBlocker: string | null };
export default function VoiceLinkSetup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [summary, setSummary] = useState<PhoneSummary | null>(null);
  const [inventory, setInventory] = useState<Array<{ e164: string; region: string; monthlyCost: string; channelMonthlyCost: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [acceptsRenewal, setAcceptsRenewal] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [provider, workspace, saved] = await Promise.all([phoneApi('/api/telephony/voicelink'), phoneApi('/api/telephony/account?provider=voicelink'), phoneApi('/api/telephony/voicelink/checkout')]);
      setStatus(provider); setSummary(workspace); setError(null);
      setCheckout(saved.checkout); setAcceptsRenewal(false);
    }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to load VoiceLink setup.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const quote = status?.quote;
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to complete VoiceLink setup.'); }
    finally { setBusy(false); }
  };
  return <AppShell title="Phone" description="Connect a phone provider to your assistant." activeRoute="phone" routeMode contentWidth="narrow"
    actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>Refresh</Button>}>
    <div className="space-y-8">
      <PhoneProviderChoice selected="voicelink"/>
      {error && <Notice tone="error">{error}</Notice>}
      {!status ? <Skeleton className="h-52"/> : <>
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold">VoiceLink setup</h2>
            <span className="rounded-full bg-warning-soft px-3 py-1 text-sm text-warning">Not ready for activation</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">VoiceLink can connect phone calls to your existing assistant. Your AI, knowledge and tools stay in this app.</p>
          <Notice tone="info">VoiceLink account and identity setup is available when your operator connects the reseller API. Live phone activation is waiting for provider verification.</Notice>
          <p className="text-sm leading-relaxed text-muted-foreground">The provider documents individual PAN/Aadhaar and business verification. Complete identity checks with VoiceLink; do not upload identity documents to this app.</p>
          <a href="https://app.voicelink.co.in/documentation/reseller-setup/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">Read VoiceLink setup guide</a>
        </section>
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">Your VoiceLink account</h2>
          {!status.configured ? <Notice tone="info">Your operator needs to configure VoiceLink API access on the server. Logging into the VoiceLink portal does not connect this app automatically.</Notice> : <>
            {status.currentPlan && <p className="text-sm text-muted-foreground">Provider plan: {status.currentPlan.name} · {status.currentPlan.availableChannels} unallocated channels · {status.currentPlan.pulseSeconds ?? 'Unconfirmed'} second billing pulse</p>}
            {!summary?.account ? <>
              <p className="text-sm text-muted-foreground">Create a separate customer account for this workspace. VoiceLink will send an email verification link; complete identity checks in its portal.</p>
              <Button disabled={busy || !status.accountCreationAvailable || !summary?.phoneActivationApproved || !summary?.browserTestCompleted}
                onClick={() => void run(async () => { setSummary(await phoneApi('/api/telephony/account?provider=voicelink', { provider: 'voicelink' })); })}>Create VoiceLink account</Button>
              {!status.accountCreationAvailable && <p className="text-sm text-muted-foreground">{status.accountCreationBlocker ?? 'Your operator must verify the reseller account and make a channel available first.'}</p>}
              {summary && (!summary.phoneActivationApproved || !summary.browserTestCompleted) && <p className="text-sm text-muted-foreground">Alpha phone approval and a browser voice test are required before account creation.</p>}
            </> : <>
              {summary.account.status==='needs_review' && <Notice tone="warning">Account creation needs operator recovery. No second account will be created.</Notice>}
              <p className="text-sm">Identity status: <strong>{summary.account.kycStatus.replaceAll('_', ' ')}</strong></p>
              <p className="text-sm text-muted-foreground">Verify the email sent by VoiceLink, then sign in to its portal for PAN/Aadhaar or business KYC. Use VoiceLink’s password-reset flow if needed. Return here to check verification.</p>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy || summary.account.status !== 'active'} onClick={() => void run(async () => {
                  const session = await phoneApi('/api/telephony/kyc/session?provider=voicelink', { provider: 'voicelink' });
                  window.location.assign(session.url);
                })}>Open VoiceLink verification</Button>
                <Button variant="outline" disabled={busy} onClick={() => void run(async () => { setSummary(await phoneApi('/api/telephony/kyc?provider=voicelink', { provider: 'voicelink' })); })}>Check verification</Button>
              </div>
            </>}
          </>}
        </section>
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">Number, capacity and calling costs</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">VoiceLink charges separately for the number, concurrent-call channels and usage. One channel supports one simultaneous call. Your AI and hosting costs are additional.</p>
          {!quote ? <Notice tone="warning">Quote required. VoiceLink’s public manuals do not publish rates. Ask your operator for the number rental, channel rental and incoming/outgoing call prices before activating.</Notice> : <>
            <p className="text-xs text-muted-foreground">{status.quoteSource === 'provider_api' ? 'Current provider plan' : 'Operator-entered quote'} · {quote.reference} · Confirm terms with VoiceLink</p>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt>Number rental</dt><dd className="text-right">{money(quote.numberMonthlyMinor)}/month</dd>
              <dt>One channel</dt><dd className="text-right">{money(quote.channelMonthlyMinor)}/month</dd>
              <dt>Incoming calls</dt><dd className="text-right">{money(quote.inboundMinuteMinor)}/min</dd>
              <dt>Outgoing calls</dt><dd className="text-right">{money(quote.outboundMinuteMinor)}/min</dd>
            </dl>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <caption className="py-3 text-left text-muted-foreground">One number + one channel + incoming billed minutes</caption>
              <thead><tr><th scope="col" className="py-2">Minutes/month</th><th scope="col" className="text-right">Carrier estimate</th></tr></thead>
              <tbody>{[60, 300, 1000].map(minutes => <tr key={minutes} className="border-t border-border"><td className="py-3">{minutes}</td><td className="text-right tabular-nums">{money(quote.numberMonthlyMinor + quote.channelMonthlyMinor + minutes * quote.inboundMinuteMinor)}</td></tr>)}</tbody>
            </table></div>
            <p className="text-xs leading-relaxed text-muted-foreground">Illustrative usage estimate, not a purchase quote. Excludes setup, release, taxes, minimum commitments, AI, hosting and additional call legs. Confirm billing increments and bundled usage separately.</p>
          </>}
          {status.configured && <>
            <Button variant="outline" disabled={busy} onClick={() => void run(async () => { setInventory((await phoneApi('/api/telephony/voicelink/inventory')).items); })}>Browse VoiceLink numbers</Button>
            <p className="text-xs text-muted-foreground">Browsing is read-only. Number purchases remain unavailable until live calling and commercial terms are verified.</p>
            <ul className="divide-y divide-border">{inventory.map(item => <li key={item.e164} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold tabular-nums">{item.e164}</p><p className="text-muted-foreground">{item.region} · ₹{item.monthlyCost}/month number + ₹{item.channelMonthlyCost}/month channel</p></div>
              <Button variant="outline" disabled={busy || !!checkout || !summary?.account || summary.account.callsBlocked || summary.account.status !== 'active'}
                onClick={() => void run(async () => { setCheckout(await phoneApi('/api/telephony/voicelink/checkout', { e164: item.e164 }, crypto.randomUUID())); })}>Request number quote</Button>
            </li>)}</ul>
          </>}
        </section>
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">Customer number checkout</h2>
          <p className="text-sm text-muted-foreground">You choose your number here. The platform purchases it through its reseller account and assigns it to your verified VoiceLink client. Your organiser purchases channel capacity separately; this integration allocates one channel to each client. Sharing channels across clients has not been confirmed.</p>
          {!checkout ? <p className="text-sm text-muted-foreground">Complete client verification, then browse numbers and request a quote. Requesting a quote temporarily reserves the number but does not pay for it.</p> : <>
            <p className="font-semibold tabular-nums">{checkout.e164}</p>
            <p className="text-sm">Checkout status: {checkout.state.replaceAll('_', ' ')}</p>
            {checkout.recoveryMessage && <Notice tone="info">{checkout.recoveryMessage}</Notice>}
            {checkout.recoveryCheckedAt && <p className="text-xs text-muted-foreground">Last recovery check: {new Date(checkout.recoveryCheckedAt).toLocaleString()}</p>}
            {checkout.quote && <dl className="grid grid-cols-2 gap-3 text-sm"><dt>Provider order total</dt><dd className="text-right">{money(checkout.quote.totalMinor)}</dd><dt>Provider number rental</dt><dd className="text-right">{money(checkout.quote.monthlyMinor)}/month</dd></dl>}
            <Notice tone="warning">VoiceLink requires automatic renewal. The provider order total is separate from your app’s final plan price.
              {checkout.terms ? ` Reviewed exit fee: ${money(checkout.terms.releaseMinor)}; minimum commitment: ${checkout.terms.commitmentMonths} months. Reference: ${checkout.terms.reference}.` : ' Release fees and minimum commitment are awaiting confirmation.'}</Notice>
            {checkout.customerPrice ? <p className="text-sm">Your app price: {money(checkout.customerPrice.monthlyMinor)}/month + {money(checkout.customerPrice.setupMinor)} setup. Initial balance reservation: {money(checkout.customerPrice.initialChargeMinor)}.</p> : <p className="text-sm text-muted-foreground">Your organiser must configure your app plan price before purchase.</p>}
            {checkout.confirmationBlocker && <p className="text-sm text-muted-foreground">{checkout.confirmationBlocker}</p>}
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={acceptsRenewal} disabled={!checkout.confirmationAvailable || busy}
              onChange={event => setAcceptsRenewal(event.target.checked)}/>I accept the reviewed recurring renewal and exit terms.</label>
            <Button disabled={busy || !checkout.confirmationAvailable || !acceptsRenewal} onClick={() => void run(async () => {
              const result = await phoneApi('/api/telephony/voicelink/checkout/confirm', { id: checkout.id, acceptsAutoRenew: true, acceptedChargeMinor: checkout.customerPrice?.initialChargeMinor, acceptedMonthlyMinor: checkout.customerPrice?.monthlyMinor, acceptedSetupMinor: checkout.customerPrice?.setupMinor, acceptedTermsReference: checkout.terms?.reference, acceptedReleaseMinor: checkout.terms?.releaseMinor, acceptedCommitmentMonths: checkout.terms?.commitmentMonths });
              setCheckout(result.checkout);
            })}>Purchase and assign number</Button>
            <p className="text-xs text-muted-foreground">A paid confirmation is never replayed after an uncertain response. A purchased number becomes callable only after verified assistant routing.</p>
          </>}
        </section>
        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">Before activation</h2>
          <p className="text-sm text-muted-foreground">Your operator needs the following from VoiceLink:</p>
          <ul className="list-disc space-y-2 pl-5 text-sm">{status.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
          <p className="text-sm text-muted-foreground">You can keep testing your assistant in the browser while setup is completed.</p>
          <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">Test your assistant</Link>
        </section>
      </>}
    </div>
  </AppShell>;
}
