import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceLinkClient } from '@/lib/telephony/providers/voicelink/client';
import { VoiceLinkCommerce, voiceLinkPurchaseTerms, assertVoiceLinkRetailAcceptance, assertVoiceLinkTermsAcceptance } from '@/lib/telephony/providers/voicelink/commerce';

test('VoiceLink checkout uses reseller draft, quote, confirmation and explicit client mapping contracts', async () => {
  const paths: string[] = [];
  const client = new VoiceLinkClient('fixture-token', (async (input, init) => {
    const path = new URL(String(input)).pathname.replace('/api/v1', ''); paths.push(path);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    let data;
    if (path === '/reseller/purchase/lock-did') {
      assert.deepEqual(body, { did_ids: ['7'], months: 1 });
      data = { order_id: 9, locked_dids: [{ did_id: 7, did_number: '+918012345678', monthly_rate: 299 }] };
    } else if (path === '/reseller/purchase/summary/9') {
      assert.equal(init?.method, 'GET'); data = { order_id: 9, months: 1, did_count: 1, channel_count: 0,
        total: 352.82, subtotal: 299, did_cost: 299, channel_cost: 0, discount: 0 };
    } else if (path === '/reseller/purchase/confirm') {
      assert.deepEqual(body, { order_id: '9' }); data = { purchase_order_id: 10, total: 352.82 };
    } else {
      assert.equal(path, '/reseller/client/map-did');
      assert.deepEqual(body, { client_id: '11', did_id: '7', call_recording: 0, user_status: 2 });
      data = { client_id: 11, did_id: 7 };
    }
    return Response.json({ status: true, data });
  }) as typeof fetch);
  const api = new VoiceLinkCommerce(client);
  const locked = await api.lock('7', '+918012345678');
  const quote = await api.quote(locked.orderId, locked.monthlyMinor);
  assert.equal(quote.totalMinor, 35282); assert.equal(quote.autoRenew, true);
  assert.equal(await api.confirm('9', quote.totalMinor), '10'); await api.assign('11', '7');
  assert.equal(paths.length, 4);
});
test('VoiceLink checkout rejects changed DID identity, hidden channel purchases and changed paid amount', async () => {
  const response = (data: unknown) => new VoiceLinkCommerce(new VoiceLinkClient('fixture', (async () => Response.json({ status: true, data })) as typeof fetch));
  await assert.rejects(response({ order_id: 9, locked_dids: [{ did_id: 8, did_number: '+918012345678', monthly_rate: 299 }] }).lock('7', '+918012345678'));
  await assert.rejects(response({ order_id: 9, months: 1, did_count: 1, channel_count: 1 }).quote('9', 29900));
  await assert.rejects(response({ purchase_order_id: 10, total: 400 }).confirm('9', 29900));
  await assert.rejects(response({ client_id: 99, did_id: 7 }).assign('11', '7'));
});
test('Unknown release fees and commitment never become zero by default', () => {
  const keys = ['VOICELINK_COMMERCIAL_TERMS_REFERENCE', 'VOICELINK_RELEASE_COST_MINOR', 'VOICELINK_COMMITMENT_MONTHS'];
  const prior = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    assert.throws(voiceLinkPurchaseTerms, /operator confirmation/);
    process.env.VOICELINK_COMMERCIAL_TERMS_REFERENCE = 'fixture-confirmed';
    process.env.VOICELINK_RELEASE_COST_MINOR = '0'; process.env.VOICELINK_COMMITMENT_MONTHS = '1';
    assert.equal(voiceLinkPurchaseTerms().releaseMinor, 0);
    process.env.VOICELINK_COMMITMENT_MONTHS = '0';
    assert.throws(voiceLinkPurchaseTerms, /operator confirmation/);
  } finally { keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; }); }
});

test('Retail acceptance detects changed recurring/setup split even when the initial total matches', () => {
  const accepted = { acceptedChargeMinor: 11000, acceptedMonthlyMinor: 10000, acceptedSetupMinor: 1000 };
  assert.doesNotThrow(() => assertVoiceLinkRetailAcceptance(accepted, { initialChargeMinor: 11000, monthlyMinor: 10000, setupMinor: 1000 }));
  assert.throws(() => assertVoiceLinkRetailAcceptance(accepted, { initialChargeMinor: 11000, monthlyMinor: 9000, setupMinor: 2000 }), /price changed/);
  assert.throws(() => assertVoiceLinkRetailAcceptance({ acceptedChargeMinor: 11000 }, { initialChargeMinor: 11000, monthlyMinor: 10000, setupMinor: 1000 }), /price changed/);
});

test('Renewal acceptance checks actual exit/commitment values even if a reference is reused', () => {
  const accepted={acceptedTermsReference:'reviewed',acceptedReleaseMinor:0,acceptedCommitmentMonths:1};
  assert.doesNotThrow(()=>assertVoiceLinkTermsAcceptance(accepted,{reference:'reviewed',releaseMinor:0,commitmentMonths:1}));
  assert.throws(()=>assertVoiceLinkTermsAcceptance(accepted,{reference:'reviewed',releaseMinor:100,commitmentMonths:1}),/terms changed/);
  assert.throws(()=>assertVoiceLinkTermsAcceptance(accepted,{reference:'reviewed',releaseMinor:0,commitmentMonths:12}),/terms changed/);
});
