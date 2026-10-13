import { HttpError } from '@/lib/auth/context';
import { ProviderError } from '../../errors';
import { normalizeE164 } from '../../policy';
import { VoiceLinkClient, record, providerId } from './client';
import { rupeesMinor } from './schemas';

export interface VoiceLinkOrderQuote {
  totalMinor: number; subtotalMinor: number; discountMinor: number;
  didCostMinor: number; channelCostMinor: number; monthlyMinor: number;
  autoRenew: true; months: 1;
}
export class VoiceLinkCommerce {
  constructor(private client = new VoiceLinkClient()) {}
  async lock(didId: string, e164: string) {
    const data = record(await this.client.request('/reseller/purchase/lock-did', {
      method: 'POST', operation: 'purchase', body: { did_ids: [providerId(didId)], months: 1 },
    }));
    const orderId = providerId(data.order_id);
    if (!Array.isArray(data.locked_dids) || data.locked_dids.length !== 1) throw new ProviderError('purchase_mismatch', true);
    const selected = record(data.locked_dids[0]);
    if (providerId(selected.did_id) !== didId || normalizeE164(selected.did_number) !== e164) throw new ProviderError('purchase_mismatch', true);
    return { orderId, monthlyMinor: rupeesMinor(selected.monthly_rate) };
  }
  async quote(orderId: string, monthlyMinor: number): Promise<VoiceLinkOrderQuote> {
    const data = record(await this.client.request(`/reseller/purchase/summary/${providerId(orderId)}`, { operation: 'purchase' }));
    if (providerId(data.order_id) !== orderId || data.months !== 1 || data.did_count !== 1 || data.channel_count !== 0)
      throw new ProviderError('purchase_mismatch');
    const result = { totalMinor: rupeesMinor(data.total), subtotalMinor: rupeesMinor(data.subtotal),
      discountMinor: rupeesMinor(data.discount), didCostMinor: rupeesMinor(data.did_cost),
      channelCostMinor: rupeesMinor(data.channel_cost), monthlyMinor, autoRenew: true as const, months: 1 as const };
    if (result.channelCostMinor !== 0 || result.didCostMinor !== monthlyMinor || result.subtotalMinor !== result.didCostMinor ||
        result.discountMinor > result.subtotalMinor || result.totalMinor < result.subtotalMinor - result.discountMinor)
      throw new ProviderError('invalid_price');
    return result;
  }
  async confirm(orderId: string, expectedTotalMinor: number) {
    const data = record(await this.client.request('/reseller/purchase/confirm', {
      method: 'POST', operation: 'purchase', body: { order_id: providerId(orderId) },
    }));
    if (rupeesMinor(data.total) !== expectedTotalMinor) throw new ProviderError('purchase_mismatch', true);
    return providerId(data.purchase_order_id);
  }
  async assign(clientId: string, didId: string) {
    const data = record(await this.client.request('/reseller/client/map-did', { method: 'POST', operation: 'routing',
      body: { client_id: providerId(clientId), did_id: providerId(didId), call_recording: 0, user_status: 2 } }));
    if (providerId(data.client_id) !== clientId || providerId(data.did_id) !== didId) throw new ProviderError('purchase_mismatch', true);
  }
}

/** Unknown commercial terms must not become zero-cost assumptions. */
export function voiceLinkPurchaseTerms() {
  const reference = process.env.VOICELINK_COMMERCIAL_TERMS_REFERENCE?.trim();
  const release = process.env.VOICELINK_RELEASE_COST_MINOR;
  const commitment = process.env.VOICELINK_COMMITMENT_MONTHS;
  if (!reference || !/^[a-zA-Z0-9._-]{1,100}$/.test(reference) || !release || !/^\d+$/.test(release) ||
      !commitment || !/^\d+$/.test(commitment) || !Number.isSafeInteger(Number(release)) ||
      Number(release) > 10000000 || !Number.isSafeInteger(Number(commitment)) || Number(commitment) > 12)
    throw new HttpError(503, 'VoiceLink renewal, release and commitment terms need operator confirmation before purchase.');
  return { reference, releaseMinor: Number(release), commitmentMonths: Number(commitment) };
}
