import { ProviderError } from '../../errors';
import type { KycStatus } from '../../types';
import { record, providerId, type VoiceLinkData } from './client';

export function rupeesMinor(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+(?:\.\d{1,4})?$/.test(String(value))) throw new ProviderError('invalid_price');
  // Round upward to a paise for conservative quotes. Never parse currency labels.
  const [whole, fraction = ''] = String(value).split('.');
  const scaled = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  const minor = Number((scaled + 99n) / 100n);
  if (!Number.isSafeInteger(minor) || minor > 100000000) throw new ProviderError('invalid_price');
  return minor;
}
export function safeProfile(raw: VoiceLinkData) {
  const wallet = record(raw.wallet), channels = record(raw.channels), plan = record(raw.active_plan);
  if (raw.currency !== 'INR' || wallet.currency !== 'INR' || !Array.isArray(plan.did_type_rates) ||
      !Number.isSafeInteger(channels.available) || Number(channels.available) < 0 ||
      !['free', 'limited', 'unlimited'].includes(String(plan.plan_type)) || !['prepaid', 'postpaid'].includes(String(raw.billing_mode))) throw new ProviderError('invalid_response');
  return { id: providerId(raw.id), active: raw.is_active === 1, verified: raw.is_verified === true,
    balanceMinor: rupeesMinor(wallet.balance), billingMode: String(raw.billing_mode), availableChannels: Number(channels.available),
    planName: typeof plan.plan_name === 'string' ? plan.plan_name.slice(0, 100) : 'VoiceLink plan',
    planType: String(plan.plan_type), channelMonthlyMinor: rupeesMinor(plan.monthly_channel_rate),
    inboundMinuteMinor: plan.inbound_rate === null || plan.inbound_rate === undefined ? null : rupeesMinor(plan.inbound_rate),
    outboundMinuteMinor: plan.outbound_rate === null || plan.outbound_rate === undefined ? null : rupeesMinor(plan.outbound_rate),
    pulseSeconds: Number.isSafeInteger(plan.pulse_seconds) && Number(plan.pulse_seconds) > 0 ? Number(plan.pulse_seconds) : null,
    didRates: plan.did_type_rates.map(value => { const rate = record(value); return {
      typeId: providerId(rate.did_type_id), name: typeof rate.name === 'string' ? rate.name.slice(0, 100) : 'Phone number', monthlyMinor: rupeesMinor(rate.rate),
    }; }),
  };
}
/** Drops document numbers, URLs, file names, addresses and all identity attributes. */
export function safeKyc(raw: VoiceLinkData): KycStatus {
  if (!['individual', 'business'].includes(String(raw.account_type)) || typeof raw.is_complete !== 'boolean' ||
      typeof raw.pan_verified !== 'boolean' || typeof raw.aadhaar_verified !== 'boolean') throw new ProviderError('invalid_kyc_account');
  const business = raw.account_type === 'business';
  if (business && typeof raw.gst_verified !== 'boolean') throw new ProviderError('invalid_kyc_account');
  const permitted = raw.is_complete === true && raw.kyc_status === 1 && raw.current_step === 'complete' &&
    raw.pan_verified === true && raw.aadhaar_verified === true && (!business || raw.gst_verified === true);
  return { status: permitted ? 'verified' : 'pending', callsBlocked: !permitted,
    documents: { pan: raw.pan_verified ? 'verified' : 'not_started', aadhaar: raw.aadhaar_verified ? 'verified' : 'not_started',
      ...(business ? { gst: raw.gst_verified ? 'verified' as const : 'not_started' as const } : {}) } };
}
