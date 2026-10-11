import type { TelephonyProvider, AccountRef, AvailableNumber, NumberInventory, KycState } from '../../types';
import { request, parentCredentials } from './client';
import { object, string, decimal, integer } from './schemas';
import { getTenantSecretValue } from '@/lib/tenant/secrets';
import { ProviderError } from '../../errors';
import { normalizeE164 } from '../../policy';
import { verifyKycWebhook, verifyVoiceWebhook } from './webhooks';

const enc = encodeURIComponent;
const states = new Set(['not_started','pending','verified','failed']);
function state(value: unknown): KycState {
  if (typeof value !== 'string' || !states.has(value)) throw new ProviderError('invalid_kyc_state');
  return value as KycState;
}
function number(value: unknown): AvailableNumber {
  const n = object(value);
  return { id: string(n.id), e164: normalizeE164(n.e164), country: string(n.country),
    region: typeof n.region === 'string' ? n.region : '',
    monthlyCost: decimal(n.monthly_fee), setupCost: decimal(n.setup_fee ?? 0), currency: string(n.currency),
    voice: n.voice_enabled !== false && (!n.capabilities || object(n.capabilities).voice !== false) };
}
function inventory(value: unknown, page: number): NumberInventory {
  const data = object(value);
  if (!Array.isArray(data.items)) throw new ProviderError('invalid_inventory');
  return { items: data.items.map(number), total: integer(data.total ?? data.items.length), page };
}
async function runtimeCredentials(account: AccountRef) {
  const token = await getTenantSecretValue(account.tenantId, 'vobiz', 'auth_token');
  if (!token) throw new ProviderError('missing_runtime_credential');
  return { authId: account.authId, authToken: token };
}
export const vobizProvider: TelephonyProvider = {
  name: 'vobiz',
  get configured() { return !!process.env.VOBIZ_AUTH_ID && !!process.env.VOBIZ_AUTH_TOKEN; },
  get activationReady() { return this.configured && process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED==='1'; },
  async createCustomerAccount(input) {
    const result = object(await request(`/accounts/${enc(parentCredentials().authId)}/sub-accounts/`, {
      method: 'POST', body: { name: input.name, email: input.email, kyc_mode: 'customer_use', business_type: 'individual', enabled: true, permissions: { calls: true, cdr: true } },
    }));
    const account = object(result.sub_account ?? result);
    const credentials = result.auth_credentials ? object(result.auth_credentials) : account;
    return { accountId: string(account.id ?? account.auth_id), authId: string(credentials.auth_id),
      authToken: string(credentials.auth_token), enabled: account.enabled !== false };
  },
  async getCustomerAccount(account) {
    const data = object(await request(`/accounts/${enc(parentCredentials().authId)}/sub-accounts/${enc(account.authId)}`));
    return { accountId: string(data.id), authId: string(data.auth_id), enabled: data.enabled === true && data.is_active !== false };
  },
  async createKycSession(account, input) {
    const data = object(await request(`/sub-accounts/${enc(account.authId)}/kyc-sessions`, {
      method: 'POST', body: { account_auth_id: account.authId, flow_type: 'redirect', redirect_url: input.returnUrl,
        webhook_url: input.webhookUrl, expires_in_days: 1 },
    }));
    const url = new URL(string(data.widget_url));
    if (url.protocol !== 'https:' || url.hostname !== 'kyc.vobiz.ai' || url.username || url.password) throw new ProviderError('invalid_kyc_url');
    return { id: string(data.session_id), url: url.href, expiresAt: string(data.expires_at), status: string(data.status) };
  },
  async getKycStatus(account) {
    // Test mode changes per-document verification endpoints, not the status gate.
    const data = object(await request(`/sub-accounts/${enc(account.authId)}/kyc/status`));
    if (data.sub_account_id !== account.authId || data.kyc_mode !== 'customer_use' || data.business_type !== 'individual' || typeof data.kyc_calls_blocked !== 'boolean')
      throw new ProviderError('invalid_kyc_account');
    const docs = object(data.verifications);
    const documents: Record<string, KycState> = {};
    for (const name of ['pan','aadhaar']) if (docs[name] !== undefined) documents[name] = state(docs[name]);
    return { status: state(data.overall_status), callsBlocked: data.kyc_calls_blocked, documents };
  },
  async searchAvailableNumbers(input) {
    const params = new URLSearchParams({ country: 'IN', page: String(input.page ?? 1), per_page: '25', search: input.search ?? '' });
    return inventory(await request(`/Account/${enc(parentCredentials().authId)}/inventory/numbers?${params}`), input.page ?? 1);
  },
  async purchaseNumber(account, e164) {
    const data = object(await request(`/Account/${enc(account.authId)}/numbers/purchase-from-inventory`, {
      method: 'POST', credentials: await runtimeCredentials(account), body: { e164, currency: 'INR' },
    }));
    return number(data.number);
  },
  async listOwnedNumbers(account, page) {
    return inventory(await request(`/Account/${enc(account.authId)}/numbers?page=${page}&per_page=100&include_subaccounts=false`,
      { credentials: await runtimeCredentials(account) }), page);
  },
  async releaseNumber(account, e164) {
    await request(`/Account/${enc(account.authId)}/numbers/${enc(e164)}`, { method: 'DELETE', credentials: await runtimeCredentials(account) });
  },
  async createInboundApplication(account, name, urls) {
    const data = object(await request(`/Account/${enc(account.authId)}/Application/`, { method: 'POST',
      credentials: await runtimeCredentials(account), body: { app_name: name, answer_url: urls.answer,
        answer_method: 'POST', hangup_url: urls.hangup, hangup_method: 'POST', public_uri: false } }));
    return string(data.app_id);
  },
  async configureInboundRouting(account, e164, applicationId) {
    await request(`/Account/${enc(account.authId)}/numbers/${enc(e164)}/application`, { method: 'POST',
      credentials: await runtimeCredentials(account), body: { application_id: applicationId } });
  },
  async verifyInboundRouting(account, e164, applicationId) {
    const credentials = await runtimeCredentials(account);
    const data = object(await request(`/Account/${enc(account.authId)}/numbers?search=${enc(e164)}&per_page=100&include_subaccounts=false`, { credentials }));
    if (!Array.isArray(data.items)) throw new ProviderError('invalid_inventory');
    const matched = data.items.map(object).find((n) => n.e164 === e164);
    return !!matched && String(matched.application_id) === applicationId && matched.is_blocked !== true && matched.voice_enabled !== false;
  },
  async createOutboundCall(account, input) {
    const data = object(await request(`/Account/${enc(account.authId)}/Call/`, { method: 'POST', credentials: await runtimeCredentials(account),
      body: { from: input.from, to: input.to, answer_url: input.answer, answer_method: 'POST', hangup_url: input.hangup, hangup_method: 'POST' } }));
    return string(data.request_uuid ?? data.call_uuid);
  },
  async getCall(account, id, completed = false) {
    const data = object(await request(completed
      ? `/Account/${enc(account.authId)}/cdr/${enc(id)}`
      : `/Account/${enc(account.authId)}/Call/${enc(id)}?status=live`, { credentials: await runtimeCredentials(account) }));
    const call = completed ? object(data.data) : data;
    const direction = completed ? call.call_direction : call.direction;
    if (direction !== 'inbound' && direction !== 'outbound') throw new ProviderError('invalid_call');
    if (string(completed ? call.uuid : call.call_uuid) !== id) throw new ProviderError('invalid_call');
    return { id, direction, from: normalizeE164(completed ? call.caller_id_number : call.from),
      to: normalizeE164(completed ? call.destination_number : call.to),
      status: completed ? String(call.hangup_cause) : string(call.call_status),
      ...(completed ? { startedAt: string(call.start_time), endedAt: string(call.end_time),
        answeredAt: typeof call.answer_time === 'string' ? call.answer_time : undefined,
        durationSeconds: integer(call.duration), billableSeconds: integer(call.billsec),
        cost: decimal(call.total_cost), currency: string(call.currency) } : {}) };
  },
  verifyKycWebhook, verifyVoiceWebhook,
};
