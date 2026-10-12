/** Public manuals describe capabilities, not authenticated provisioning endpoints.
 * No key or environment flag can turn an unimplemented provider into a live one.
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
    status: 'awaiting_provider_contract' as const,
    quote: readVoiceLinkQuote(env),
    blockers: ['Provisioning and hosted KYC API documentation', 'Authenticated call metadata, WebSocket and webhook contract',
      'Authoritative call billing and number ownership API', 'Account-specific number, channel and usage quote'],
  };
}
