import crypto from 'node:crypto';
import { HttpError } from '@/lib/auth/context';
import type { AccountRef, AvailableNumber, TelephonyProvider } from '../../types';
import { ProviderError } from '../../errors';
import { VoiceLinkClient, providerId, record } from './client';
import { safeKyc, safeProfile, rupeesMinor, voiceLinkDidE164, isVoiceLinkIndiaCode } from './schemas';

/** API operations confirmed in authenticated Developer Hub on 2026-10-12.
 * Live media admission/hangup is not documented: never treat portal login or a
 * local flag as evidence that callbacks or carrier termination are safe.
 */
export function createVoiceLinkProvider(client = new VoiceLinkClient()): TelephonyProvider {
  async function ownedClient(account: AccountRef) {
    const profile = safeProfile(await client.profile());
    if (!account.accountId || account.accountId !== `${profile.id}:${providerId(account.authId)}`) throw new ProviderError('invalid_kyc_account');
    const customer = (await client.clients()).find(row => providerId(row.id) === account.authId);
    if (!customer || customer.currency !== 'INR') throw new ProviderError('invalid_kyc_account');
    return { profile, customer };
  }
  const unavailable = async (): Promise<never> => { throw new HttpError(503,
    'VoiceLink calling needs verified callback authentication, live call lookup and carrier hangup controls. No number purchase or routing change was made.'); };
  return {
    name: 'voicelink',
    get configured() { return !!process.env.VOICELINK_AUTH_TOKEN?.trim(); },
    get activationReady() { return false; },
    async preflightCustomerAccount(input) {
      const profile = safeProfile(await client.profile());
      if (profile.billingMode !== 'prepaid') throw new HttpError(409, 'Managed VoiceLink setup currently requires prepaid reseller billing.');
      if (!profile.active || !profile.verified) throw new HttpError(409, 'The VoiceLink reseller account needs verification.');
      if (profile.availableChannels < 1) throw new HttpError(409, 'Your VoiceLink operator must allocate an available channel before creating a customer account.');
      if (profile.planType === 'free') throw new HttpError(409, 'VoiceLink trial client provisioning needs provider confirmation before account creation.');
      if (input.name.trim().split(/\s+/).length < 2) throw new HttpError(409, 'Add your full contact name before creating a VoiceLink account.');
    },
    async createCustomerAccount(input) {
      const profile = safeProfile(await client.profile());
      if (profile.billingMode !== 'prepaid') throw new HttpError(409, 'Managed VoiceLink setup currently requires prepaid reseller billing.');
      if (!profile.active || !profile.verified) throw new HttpError(409, 'The VoiceLink reseller account needs verification.');
      if (profile.availableChannels < 1) throw new HttpError(409, 'Your VoiceLink operator must allocate an available channel before creating a customer account.');
      if (profile.planType === 'free') throw new HttpError(409, 'VoiceLink trial client provisioning needs provider confirmation before account creation.');
      const parts = input.name.trim().split(/\s+/);
      if (parts.length < 2) throw new HttpError(409, 'Add your full contact name before creating a VoiceLink account.');
      const payload = { first_name: parts[0], last_name: parts.slice(1).join(' '), email: input.email,
        username: input.providerUsername ?? `ka_${crypto.randomUUID().replaceAll('-', '')}`, password: crypto.randomBytes(32).toString('base64url'),
        // Hosted KYC requires a provider portal login. Do not give that login
        // unbounded access to the reseller wallet while completing identity.
        is_active: 1, channel_count: 1, negative_threshold: 0, wallet_balance: 0, wallet_bypass: 0,
        ...(profile.planType === 'unlimited' ? { plan_type: 'unlimited' } : {
          pulse_seconds: profile.pulseSeconds, inbound_rate: (profile.inboundMinuteMinor ?? 0) / 100,
          outbound_rate: (profile.outboundMinuteMinor ?? 0) / 100,
        }) };
      if (profile.planType === 'limited' && (!profile.pulseSeconds || profile.inboundMinuteMinor === null || profile.outboundMinuteMinor === null)) throw new ProviderError('invalid_price');
      const data = record(await client.request('/reseller/client/create', { method: 'POST', body: payload, operation: 'create_account' }));
      const id = providerId(data.client_id);
      // Password is sent only to VoiceLink, never retained or returned. Customers
      // verify their email and use VoiceLink's own login/reset flow for hosted KYC.
      return { accountId: `${profile.id}:${id}`, authId: id, enabled: true };
    },
    async getCustomerAccount(account) {
      const { customer } = await ownedClient(account);
      return { accountId: account.accountId!, authId: providerId(customer.id), enabled: customer.is_active === 1 };
    },
    async createKycSession(account) {
      await ownedClient(account);
      // This is a provider portal handoff, not an invented hosted-session API.
      return { id: null, url: 'https://app.voicelink.co.in/login', expiresAt: null, status: 'portal' };
    },
    async getKycStatus(account) {
      const { customer } = await ownedClient(account);
      const result = safeKyc(await client.kyc(account.authId));
      return { ...result, callsBlocked: result.callsBlocked || customer.is_active !== 1 };
    },
    async getPlatformBalance() {
      const profile = safeProfile(await client.profile());
      return { availableMinor: profile.balanceMinor, active: profile.active && profile.verified && profile.billingMode === 'prepaid' };
    },
    async searchAvailableNumbers(input) {
      const profile = safeProfile(await client.profile());
      const data = await client.inventory(input.search, input.page);
      if (!Array.isArray(data.data)) throw new ProviderError('invalid_inventory');
      const items: AvailableNumber[] = data.data.map(value => {
        const row = record(value);
        const monthlyMinor = rupeesMinor(row.monthly_rate);
        const e164 = voiceLinkDidE164(row.did_number);
        if (!isVoiceLinkIndiaCode(row.country_code) || !e164.startsWith('+91')) throw new ProviderError('invalid_inventory');
        return { id: providerId(row.id), e164, country: 'IN', region: String(row.type_label ?? '').slice(0, 100),
          monthlyCost: (monthlyMinor / 100).toFixed(2), setupCost: '', currency: 'INR', voice: true,
          // Commercial setup/release/commitment fields aren't in this schema.
          // Unknown terms remain unknown and cannot pass the purchase policy.
          available: true, restricted: false, channelMonthlyCost: (profile.channelMonthlyMinor / 100).toFixed(2) };
      });
      // Inventory schema does not document a total; never invent pagination.
      return { items, total: typeof data.total === 'number' ? data.total : items.length, page: input.page ?? 1 };
    },
    async listOwnedNumbers(account, page) {
      await ownedClient(account);
      const data = await client.purchased(account.authId, page);
      if (!Array.isArray(data.data) || !Number.isSafeInteger(data.total)) throw new ProviderError('invalid_inventory');
      const items = data.data.map(record).filter(row => String(row.client_id) === account.authId && row.status !== 6).map(row => ({
        id: providerId(row.id), e164: voiceLinkDidE164(row.did_number), country: 'IN', region: String(row.type_label ?? ''),
        monthlyCost: '', setupCost: '', currency: 'INR', voice: true,
        available: row.status === 2 && row.user_status === 2 && row.is_expired === false && row.is_user_expired === false,
      }));
      return { items, total: Number(data.total), page };
    },
    purchaseNumber: unavailable, releaseNumber: unavailable, createInboundApplication: unavailable,
    configureInboundRouting: unavailable, verifyInboundRouting: async () => false, createOutboundCall: unavailable,
    getCall: unavailable,
    verifyVoiceWebhook: () => null, verifyKycWebhook: () => false,
  };
}
export const voiceLinkProvider = createVoiceLinkProvider();
