import { VoiceLinkClient } from './client';
import { safeProfile } from './schemas';

/** Authenticated Developer Hub contracts are implemented for account/KYC reads.
 * Media authentication, live lookup and carrier hangup still require confirmation.
 */
export interface VoiceLinkQuote {
  reference: string;
  numberMonthlyMinor: number;
  channelMonthlyMinor: number;
  inboundMinuteMinor: number;
  outboundMinuteMinor: number;
}
export function readVoiceLinkQuote(env: Record<string, string | undefined> = process.env): VoiceLinkQuote | null {
  const reference = env.VOICELINK_QUOTE_REFERENCE?.trim();
  if (!reference || reference.length > 100 || !/^[a-zA-Z0-9._-]+$/.test(reference)) return null;
  const keys = ['VOICELINK_NUMBER_MONTHLY_MINOR', 'VOICELINK_CHANNEL_MONTHLY_MINOR',
    'VOICELINK_INBOUND_MINUTE_MINOR', 'VOICELINK_OUTBOUND_MINUTE_MINOR'] as const;
  const amounts = keys.map(key => {
    const raw = env[key];
    if (!raw || !/^\d+$/.test(raw)) return NaN;
    const amount = Number(raw);
    return Number.isSafeInteger(amount) && amount <= 10000000 ? amount : NaN;
  });
  if (amounts.some(amount => !Number.isFinite(amount))) return null;
  return { reference, numberMonthlyMinor: amounts[0], channelMonthlyMinor: amounts[1],
    inboundMinuteMinor: amounts[2], outboundMinuteMinor: amounts[3] };
}
export function voiceLinkStatus(env: Record<string, string | undefined> = process.env) {
  return {
    provider: 'voicelink' as const, activationReady: false, provisioningSupported: false,
    accountSetupSupported: true, numberPurchaseSupported: false,
    configured: !!env.VOICELINK_AUTH_TOKEN?.trim(), accountCreationAvailable: false,
    currentPlan: null as null | { name: string; availableChannels: number; pulseSeconds: number | null },
    quoteSource: 'operator_quote' as 'operator_quote' | 'provider_api',
    status: 'awaiting_media_contract' as const,
    quote: readVoiceLinkQuote(env),
    blockers: ['Provider-confirmed WebSocket and webhook authentication', 'Authoritative live call lookup before AI admission',
      'Carrier hangup and maximum billable call duration controls', 'Billing duration, timezone and release/renewal terms'],
  };
}
export async function loadVoiceLinkStatus(client = new VoiceLinkClient()) {
  const status = voiceLinkStatus();
  if (!status.configured) return status;
  const profile = safeProfile(await client.profile());
  const rate = profile.didRates.find(row => row.typeId === '3');
  return { ...status, currentPlan: { name: profile.planName, availableChannels: profile.availableChannels, pulseSeconds: profile.pulseSeconds },
    accountCreationAvailable: profile.active && profile.verified && profile.availableChannels > 0 && profile.billingMode === 'prepaid',
    quoteSource: 'provider_api' as const,
    quote: rate && profile.planType === 'limited' && profile.pulseSeconds === 60 && profile.inboundMinuteMinor !== null && profile.outboundMinuteMinor !== null ? {
      reference: profile.planName, numberMonthlyMinor: rate.monthlyMinor, channelMonthlyMinor: profile.channelMonthlyMinor,
      inboundMinuteMinor: profile.inboundMinuteMinor, outboundMinuteMinor: profile.outboundMinuteMinor,
    } : null };
}
