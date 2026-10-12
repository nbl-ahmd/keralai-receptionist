import Link from 'next/link';
import type { PhoneProvider } from '@/lib/telephony/provider-options';

export default function PhoneProviderChoice({ selected }: { selected: PhoneProvider }) {
  return <nav aria-label="Phone provider" className="rounded-xl border border-border p-4">
    <p className="mb-3 text-sm font-semibold">Phone provider</p>
    <div className="grid grid-cols-2 gap-3">
      {(['vobiz', 'voicelink'] as const).map(provider => <Link key={provider}
        href={provider === 'vobiz' ? '/dashboard/phone' : '/dashboard/phone?provider=voicelink'}
        aria-current={selected === provider ? 'page' : undefined}
        className={`flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === provider ? 'border-primary bg-primary-soft text-primary' : 'border-border hover:bg-muted'}`}>
        {provider === 'vobiz' ? 'Vobiz' : 'VoiceLink'}
      </Link>)}
    </div>
    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Choose a setup to view. Existing numbers and calls stay with their current provider.</p>
  </nav>;
}
