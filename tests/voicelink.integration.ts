import test from 'node:test';
import assert from 'node:assert/strict';
import { query, queryOne } from '@/db/client';
import { createInvite } from '@/lib/alpha/invites';
import { handleAuthRequest } from '@/lib/auth/server';
import { resolveTenantContext } from '@/lib/auth/context';
import { ensureCustomerAccount, syncKyc, phoneSummary } from '@/lib/telephony/service';
import { GET as getAccount } from '@/app/api/telephony/account/route';
import { POST as startKyc } from '@/app/api/telephony/kyc/session/route';
import { GET as getStatus } from '@/app/api/telephony/voicelink/route';

test('VoiceLink DB: provider selection, two-tenant identity isolation and hosted KYC preserve Vobiz', async t => {
  assert.match(process.env.TEST_SCHEMA!, /^keralai_test_[a-f0-9]{16}$/);
  process.env.ALPHA_INVITE_ISSUANCE_ENABLED = '1';
  process.env.VOICELINK_AUTH_TOKEN = 'fixture-voicelink-token';
  const originalFetch = globalThis.fetch;
  const clients: Array<Record<string, unknown>> = [];
  const requests: Array<{ path: string; method: string; clientId: string | null }> = [];
  let verified = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== 'app.voicelink.co.in') return originalFetch(input, init);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer fixture-voicelink-token');
    const path = url.pathname.replace('/api/v1', '');
    requests.push({ path, method: init?.method ?? 'GET', clientId: url.searchParams.get('client_id') });
    let data: unknown;
    if (path === '/reseller/profile') data = { id: 777, is_active: 1, is_verified: true, currency: 'INR', billing_mode: 'prepaid',
      wallet: { balance: 1400, currency: 'INR' }, channels: { available: 2 },
      active_plan: { plan_name: 'Synthetic Limited', plan_type: 'limited', monthly_channel_rate: 199, inbound_rate: 0.5,
        outbound_rate: 0.5, pulse_seconds: 60, did_type_rates: [{ did_type_id: 3, name: 'Landline', rate: 299 }] } };
    else if (path === '/reseller/client/create') {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.wallet_balance, 0); assert.equal(body.wallet_bypass, 0); assert.equal(body.negative_threshold, 0);
      const id = 501 + clients.length; clients.push({ id, is_active: 1, currency: 'INR' }); data = { client_id: id };
    } else if (path === '/reseller/clients') data = clients;
    else if (path === '/reseller/kyc/status') {
      assert.ok(clients.some(client => String(client.id) === url.searchParams.get('client_id')));
      data = { account_type: 'individual', is_complete: verified, kyc_status: verified ? 1 : 0,
        current_step: verified ? 'complete' : 'pan', pan_verified: verified, aadhaar_verified: verified,
        pan_number: 'PRIVATE-PAN-DO-NOT-STORE', aadhaar_number: 'PRIVATE-AADHAAR-DO-NOT-STORE', documents: { pan: { url: 'https://private.example/identity' } } };
    } else throw new Error('Unexpected VoiceLink mutation or request');
    return Response.json({ status: true, data });
  };
  t.after(async () => {
    globalThis.fetch = originalFetch; delete process.env.VOICELINK_AUTH_TOKEN;
    await globalThis.__keralaiAuthPgPool?.end();
    const { closePool } = await import('../bridge/db.mjs'); await closePool();
  });
  async function workspace(email: string) {
    const invite = await createInvite('fixture-operator', { email, reason: 'isolated VoiceLink API acceptance' });
    const signup = await handleAuthRequest(new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
      method: 'POST', headers: { Origin: process.env.BETTER_AUTH_URL!, 'Content-Type': 'application/json', 'x-alpha-invite-code': invite.token },
      body: JSON.stringify({ name: 'VoiceLink Tester', email, password: 'fixture-password-123' }),
    }));
    assert.equal(signup.status, 200);
    const cookie = signup.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const request = (path: string, method = 'GET') => new Request(`${process.env.BETTER_AUTH_URL}${path}`, {
      method, headers: { cookie, Origin: process.env.BETTER_AUTH_URL!, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify({ provider: 'voicelink' }) } : {}),
    });
    const context = await resolveTenantContext(request('/api/tenant'));
    return { ...context, request };
  }
  const a = await workspace('voicelink-db-a@example.test'), b = await workspace('voicelink-db-b@example.test');
  await assert.rejects(ensureCustomerAccount(a.tenantId, a.request('/api/telephony/account', 'POST'), 'voicelink'), /approval/);
  assert.equal(requests.length, 0);
  for (const tenant of [a, b]) {
    await query('update tenant_subscriptions set phone_activation_approved=true where tenant_id=$1', [tenant.tenantId]);
    await query('update tenant_onboarding set browser_test_completed_at=now() where tenant_id=$1', [tenant.tenantId]);
    await ensureCustomerAccount(tenant.tenantId, tenant.request('/api/telephony/account', 'POST'), 'voicelink');
  }
  await query("insert into tenant_telephony_accounts(tenant_id,provider,provider_auth_id,provider_account_id,status) values($1,'vobiz','SA_PRESERVED_VL','legacy','active')", [a.tenantId]);
  assert.equal((await phoneSummary(a.tenantId)).account?.status, 'active');
  assert.equal((await phoneSummary(a.tenantId, 'voicelink')).account?.kycStatus, 'not_started');
  await syncKyc(a.tenantId, 'voicelink');
  assert.equal((await phoneSummary(a.tenantId, 'voicelink')).account?.callsBlocked, true);
  verified = true; await syncKyc(a.tenantId, 'voicelink');
  const summary = await (await getAccount(a.request('/api/telephony/account?provider=voicelink'))).json();
  assert.equal(summary.account.kycStatus, 'verified'); assert.equal(summary.configured, false); assert.equal(summary.phoneCallsReady, false);
  assert.ok(!JSON.stringify(summary).includes('PRIVATE-'));
  assert.equal((await phoneSummary(b.tenantId, 'voicelink')).account?.kycStatus, 'not_started');
  assert.ok(requests.filter(request => request.path === '/reseller/kyc/status').every(request => request.clientId === '501'));
  const portal = await (await startKyc(a.request('/api/telephony/kyc/session?provider=voicelink', 'POST'))).json();
  assert.equal(portal.url, 'https://app.voicelink.co.in/login'); assert.equal(portal.expiresAt, null);
  assert.equal((await queryOne<{ kyc_session_id: string | null }>("select kyc_session_id from tenant_telephony_accounts where tenant_id=$1 and provider='voicelink'", [a.tenantId]))!.kyc_session_id, null);
  const providerSecrets = await query("select key_name from tenant_secrets where tenant_id=$1 and provider='voicelink'", [a.tenantId]);
  assert.equal(providerSecrets.length, 0);
  const status = await (await getStatus(a.request('/api/telephony/voicelink'))).json();
  assert.equal(status.quoteSource, 'provider_api'); assert.equal(status.quote.numberMonthlyMinor, 29900); assert.equal(status.quote.channelMonthlyMinor, 19900);
  assert.equal(status.activationReady, false);
  assert.equal(requests.filter(request => request.method === 'POST').length, 2);
  assert.ok(!requests.some(request => /purchase|routing|websocket-bot|release/.test(request.path)));
});
