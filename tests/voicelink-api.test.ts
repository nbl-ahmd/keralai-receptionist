import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceLinkClient } from '../lib/telephony/providers/voicelink/client';
import { createVoiceLinkProvider } from '../lib/telephony/providers/voicelink/provider';
import { safeKyc, safeProfile, rupeesMinor } from '../lib/telephony/providers/voicelink/schemas';
import { ProviderError, providerErrorDetails } from '../lib/telephony/errors';
import { loadVoiceLinkStatus } from '../lib/telephony/providers/voicelink/status';

const profile = { id: 10, is_active: 1, is_verified: true, currency: 'INR', billing_mode: 'prepaid', wallet: { balance: 1400, currency: 'INR' },
  channels: { available: 1 }, active_plan: { plan_name: 'Synthetic plan', plan_type: 'limited', monthly_channel_rate: 199,
    inbound_rate: 0.5, outbound_rate: 0.5, pulse_seconds: 60, did_type_rates: [{ did_type_id: 3, name: 'Landline', rate: 299 }] } };
const kyc = { account_type: 'individual', is_complete: true, kyc_status: 1, current_step: 'complete', pan_verified: true, aadhaar_verified: true,
  pan_number: 'PRIVATE-PAN', aadhaar_number: 'PRIVATE-AADHAAR', documents: { pan: { url: 'https://private.example/document' } } };

function fixture(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const responses: Record<string, unknown> = { '/reseller/profile': profile,
    '/reseller/clients': [{ id: 101, currency: 'INR', is_active: 1 }],
    '/reseller/client/create': { client_id: 101 }, '/reseller/kyc/status': kyc,
    '/reseller/purchase/dids': { data: [{ id: 7, did_number: '+918012345678', country_code: '+91', monthly_rate: 299, type_label: 'Landline' }] },
    '/reseller/did/purchased': { total: 1, data: [{ id: 7, client_id: 101, did_number: '918012345678', status: 2, user_status: 2, is_expired: false, is_user_expired: false }] },
    ...overrides };
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    const u = new URL(String(url));
    assert.equal(u.origin, 'https://app.voicelink.co.in');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-test-token');
    assert.equal(init?.redirect, 'manual');
    const path = u.pathname.replace('/api/v1', '');
    calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
    assert.ok(path in responses, `Unexpected provider operation: ${path}`);
    return Response.json({ status: true, data: responses[path] });
  }) as typeof fetch;
  return { calls, client: new VoiceLinkClient('synthetic-test-token', fetcher) };
}

test('VoiceLink API validates envelope, uses fixed origin and never exposes upstream secrets in errors', async () => {
  const client = new VoiceLinkClient('synthetic-token', (async () => Response.json({ status: false, message: 'secret credential' })) as typeof fetch);
  await assert.rejects(client.profile(), error => error instanceof Error && !error.message.includes('secret credential'));
  await assert.rejects(new VoiceLinkClient('').profile(), /configuration/);
  await assert.rejects(client.request('https://evil.example/collect'));
  const timeout = new VoiceLinkClient('synthetic-token', (async () => { throw new Error('secret response'); }) as typeof fetch);
  await assert.rejects(timeout.profile(), error => error instanceof Error && !error.message.includes('secret response'));
});
test('VoiceLink rejects malformed credentials before sending and distinguishes safe connection failures', async () => {
  let requests = 0;
  const fetcher = (async () => { requests++; return Response.json({ status: true, data: profile }); }) as typeof fetch;
  for (const token of ['Bearer 1|secret', '"1|secret"', '{"access_token":"secret"}', '1|secret\nother', 'VOICELINK_AUTH_TOKEN=secret']) {
    await assert.rejects(new VoiceLinkClient(token, fetcher).profile(), error =>
      error instanceof ProviderError && error.code === 'invalid_credential_format' && !error.message.includes('secret'));
  }
  assert.equal(requests, 0);
  for (const [runtimeCode, expected] of [['ENOTFOUND', 'network_dns'], ['CERT_HAS_EXPIRED', 'network_tls'],
    ['ECONNRESET', 'network_connection'], ['UND_ERR_CONNECT_TIMEOUT', 'network_timeout'], ['PRIVATE-CODE', 'network_or_response']]) {
    const failed = new VoiceLinkClient('synthetic-token', (async () => {
      throw new Error('private token and URL', { cause: { code: runtimeCode } });
    }) as typeof fetch);
    await assert.rejects(failed.profile(), error => {
      assert.ok(error instanceof ProviderError);
      assert.equal(providerErrorDetails(error).providerCode, expected);
      assert.equal(error.uncertain, false);
      assert.ok(!error.message.includes('private'));
      return true;
    });
  }
  const timed = new VoiceLinkClient('synthetic-token', (async () => { throw new DOMException('private', 'TimeoutError'); }) as typeof fetch);
  await assert.rejects(timed.profile(), error => error instanceof ProviderError && error.code === 'network_timeout');
  const redirected = new VoiceLinkClient('synthetic-token', (async (_url, init) => {
    assert.equal(init?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'https://other.example/private' } });
  }) as typeof fetch);
  await assert.rejects(redirected.profile(), error => error instanceof ProviderError && error.code === 'redirect_rejected');
  const denied = new VoiceLinkClient('synthetic-token', (async () => new Response(null, { status: 401 })) as typeof fetch);
  await assert.rejects(denied.profile(), error => error instanceof ProviderError && error.code === 'http_401');
});
test('VoiceLink reads scoped customer KYC and strips all identity data', async () => {
  const { client, calls } = fixture(); const provider = createVoiceLinkProvider(client);
  const account = { tenantId: 'A', authId: '101', accountId: '10:101' };
  const status = await provider.getKycStatus(account);
  assert.equal(status.callsBlocked, false); assert.equal(status.status, 'verified');
  assert.ok(!JSON.stringify(status).includes('PRIVATE'));
  assert.ok(!JSON.stringify(status).includes('private.example'));
  assert.equal((await provider.createKycSession(account, { returnUrl: 'https://app.example', webhookUrl: 'https://app.example' })).url, 'https://app.voicelink.co.in/login');
  assert.ok(calls.every(call => call.method === 'GET'));
  await assert.rejects(provider.getKycStatus({ ...account, accountId: 'other:101' }));
  await assert.rejects(provider.getKycStatus({ ...account, authId: '999', accountId: '10:999' }));
});
test('VoiceLink verification never infers authorization from PAN alone or incomplete provider status', () => {
  for (const change of [{ is_complete: false }, { kyc_status: 0 }, { current_step: 'pan' }, { aadhaar_verified: false }]) {
    assert.equal(safeKyc({ ...kyc, ...change }).callsBlocked, true);
  }
  assert.throws(() => safeKyc({ ...kyc, is_complete: 'true' }));
  assert.equal(safeKyc({ ...kyc, account_type: 'business', gst_verified: false }).callsBlocked, true);
  assert.equal(safeKyc({ ...kyc, account_type: 'business', gst_verified: true }).callsBlocked, false);
});
test('VoiceLink account creation allocates existing capacity only and returns no password/token', async () => {
  const { client, calls } = fixture(); const provider = createVoiceLinkProvider(client);
  const result = await provider.createCustomerAccount({ name: 'Test Customer', email: 'customer@example.test' });
  assert.deepEqual(result, { accountId: '10:101', authId: '101', enabled: true });
  const post = calls.find(call => call.method === 'POST')!;
  assert.equal(post.path, '/reseller/client/create');
  assert.equal((post.body as Record<string, unknown>).wallet_balance, 0);
  assert.equal((post.body as Record<string, unknown>).wallet_bypass, 0);
  assert.ok(!calls.some(call => call.path.includes('/purchase/')));
  const empty = fixture({ '/reseller/profile': { ...profile, channels: { available: 0 } } });
  await assert.rejects(createVoiceLinkProvider(empty.client).preflightCustomerAccount!({ name: 'Test Customer', email: 'customer@example.test' }), /channel/);
  assert.ok(empty.calls.every(call => call.method === 'GET'));
});
test('VoiceLink observed free trial profile displays known rates without enabling client provisioning', async () => {
  const trial = { ...profile, channels: { available: 0 }, active_plan: { ...profile.active_plan, plan_type: 'free', plan_name: 'Trial Pack' } };
  assert.equal(safeProfile(trial).planType, 'free');
  const { client } = fixture({ '/reseller/profile': trial });
  const previous = process.env.VOICELINK_AUTH_TOKEN;
  process.env.VOICELINK_AUTH_TOKEN = 'synthetic-token';
  try {
    const result = await loadVoiceLinkStatus(client);
    assert.equal(result.currentPlan?.name, 'Trial Pack');
    assert.equal(result.currentPlan?.availableChannels, 0);
    assert.equal(result.quote?.numberMonthlyMinor, 29900);
    assert.equal(result.quote?.channelMonthlyMinor, 19900);
    assert.equal(result.accountCreationAvailable, false);
    assert.equal(result.activationReady, false);
  } finally {
    if (previous === undefined) delete process.env.VOICELINK_AUTH_TOKEN;
    else process.env.VOICELINK_AUTH_TOKEN = previous;
  }
  const provider = createVoiceLinkProvider(fixture({ '/reseller/profile': { ...trial, channels: { available: 1 } } }).client);
  await assert.rejects(provider.preflightCustomerAccount!({ name: 'Test Customer', email: 'test@example.test' }), /trial/);
  await assert.rejects(provider.createCustomerAccount({ name: 'Test Customer', email: 'test@example.test' }), /trial/);
  assert.throws(() => safeProfile({ ...trial, active_plan: { ...trial.active_plan, plan_type: 'unexpected' } }));
});
test('VoiceLink plan quotes, inventory and ownership use documented independent number/channel amounts', async () => {
  const { client, calls } = fixture(); const provider = createVoiceLinkProvider(client);
  const parent = safeProfile(profile); assert.equal(parent.channelMonthlyMinor, 19900);
  assert.equal(parent.didRates[0].monthlyMinor, 29900); assert.equal(parent.inboundMinuteMinor, 50);
  const inventory = await provider.searchAvailableNumbers({});
  assert.equal(inventory.items[0].monthlyCost, '299.00'); assert.equal(inventory.items[0].channelMonthlyCost, '199.00');
  assert.equal(inventory.items[0].setupCost, ''); assert.equal(inventory.items[0].releaseCost, undefined);
  const owned = await provider.listOwnedNumbers({ tenantId: 'A', authId: '101', accountId: '10:101' }, 1);
  assert.equal(owned.items[0].e164, '+918012345678'); assert.equal(owned.items[0].available, true);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.equal(rupeesMinor('0.5000'), 50); assert.equal(rupeesMinor('0.0001'), 1);
  assert.throws(() => rupeesMinor('-1')); assert.throws(() => safeProfile({ ...profile, currency: 'USD' }));
});
