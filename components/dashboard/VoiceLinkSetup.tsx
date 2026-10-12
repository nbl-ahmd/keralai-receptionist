"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import PhoneProviderChoice from './PhoneProviderChoice';
import { money, phoneApi } from '@/lib/telephony/client-ui';
import type { voiceLinkStatus } from '@/lib/telephony/providers/voicelink/status';

type Status = ReturnType<typeof voiceLinkStatus>;
export default function VoiceLinkSetup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setStatus(await phoneApi('/api/telephony/voicelink')); setError(null); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to load VoiceLink setup.'); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const quote = status?.quote;
  return <AppShell title="Phone" description="Connect a phone provider to your assistant." activeRoute="phone" routeMode contentWidth="narrow"
    actions={<Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>Refresh</Button>}>
    <div className="space-y-8">
      <PhoneProviderChoice selected="voicelink"/>
      {error ? <Notice tone="error">{error}</Notice> : !status ? <Skeleton className="h-52"/> : <>
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold">VoiceLink setup</h2>
            <span className="rounded-full bg-warning-soft px-3 py-1 text-sm text-warning">Not ready for activation</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">VoiceLink can connect phone calls to your existing assistant. Your AI, knowledge and tools stay in this app.</p>
          <Notice tone="info">VoiceLink activation is being prepared. Account creation, identity verification and number purchases are not available here yet.</Notice>
          <p className="text-sm leading-relaxed text-muted-foreground">The provider documents individual PAN/Aadhaar and business verification. Complete identity checks with VoiceLink; do not upload identity documents to this app.</p>
          <a href="https://app.voicelink.co.in/documentation/reseller-setup/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">Read VoiceLink setup guide</a>
        </section>
        <section className="space-y-4 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">Number, capacity and calling costs</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">VoiceLink charges separately for the number, concurrent-call channels and usage. One channel supports one simultaneous call. Your AI and hosting costs are additional.</p>
          {!quote ? <Notice tone="warning">Quote required. VoiceLink’s public manuals do not publish rates. Ask your operator for the number rental, channel rental and incoming/outgoing call prices before activating.</Notice> : <>
            <p className="text-xs text-muted-foreground">Operator-entered quote · {quote.reference} · Confirm terms with VoiceLink</p>
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
