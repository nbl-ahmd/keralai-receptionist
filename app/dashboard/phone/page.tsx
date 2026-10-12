import PhoneSetup from '@/components/dashboard/PhoneSetup';
import VoiceLinkSetup from '@/components/dashboard/VoiceLinkSetup';
import { isPhoneProvider } from '@/lib/telephony/provider-options';
import { notFound } from 'next/navigation';

export default async function PhonePage({ searchParams }: {
  searchParams: Promise<{ provider?: string | string[] }>;
}) {
  const { provider = 'vobiz' } = await searchParams;
  if (!isPhoneProvider(provider)) notFound();
  return provider === 'voicelink' ? <VoiceLinkSetup/> : <PhoneSetup/>;
}
