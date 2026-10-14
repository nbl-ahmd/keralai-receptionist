import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transaction } from '@/db/transaction';
import { reconcileTelephony } from '@/lib/telephony/reconcile';
import { query, queryOne } from '@/db/client';
import { createInvite } from '@/lib/alpha/invites';
import { handleAuthRequest } from '@/lib/auth/server';
import { resolveTenantContext } from '@/lib/auth/context';
import { ensureCustomerAccount, syncKyc, phoneSummary } from '@/lib/telephony/service';
import { reconcileVoiceLinkCheckout, reconcileVoiceLinkAccount, closeVoiceLinkDraft } from '@/lib/telephony/providers/voicelink/recovery';
import { adminSnapshot, adminAction } from '@/lib/telephony/admin';
import { GET as getAccount } from '@/app/api/telephony/account/route';
import { GET as managedGet, POST as managedPost } from '@/app/api/telephony/voicelink/kyc/route';
import { POST as managedUpload } from '@/app/api/telephony/voicelink/kyc/upload/route';
import { POST as startKyc } from '@/app/api/telephony/kyc/session/route';
import { GET as getStatus } from '@/app/api/telephony/voicelink/route';
import { prepareVoiceLinkCheckout, confirmVoiceLinkCheckout, voiceLinkCheckoutStatus } from '@/lib/telephony/providers/voicelink/checkout';

test('VoiceLink DB: provider selection, two-tenant identity isolation and hosted KYC preserve Vobiz', async t => {
  assert.match(process.env.TEST_SCHEMA!, /^keralai_test_[a-f0-9]{16}$/);
  await transaction(async client=>{ await client.query(readFileSync('db/migrations/018_voicelink_recovery.sql','utf8')); });
  process.env.ALPHA_INVITE_ISSUANCE_ENABLED = '1';
  process.env.VOICELINK_AUTH_TOKEN = 'fixture-voicelink-token';
  process.env.VOICELINK_KYC_TERMS_URL='https://app.voicelink.co.in/fixture-terms';
  const originalFetch = globalThis.fetch;
  const clients: Array<Record<string, unknown>> = [];
  const requests: Array<{ path: string; method: string; clientId: string | null }> = [];
  const managedStates=new Map<string,Record<string,unknown>>();const kycTargets:string[]=[];
  let verified = false, loseClientResponse = false, ownedByClient = '';
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
      const id = 501 + clients.length; clients.push({ id, username: body.username, is_active: 1, currency: 'INR' }); data = { client_id: id };
      if(loseClientResponse) throw new TypeError('Fixture lost response after provider creation');
    } else if (path === '/reseller/clients') data = clients;
    else if (path.startsWith('/reseller/kyc/') && init?.method==='POST') {
      const body=init.body instanceof FormData?Object.fromEntries(init.body.entries()):JSON.parse(String(init.body));
      const id=String(body.client_id);assert.ok(clients.some(row=>String(row.id)===id));kycTargets.push(id);
      let state=managedStates.get(id)??{account_type:'individual',is_complete:false,kyc_status:0,current_step:'register',pan_verified:false,aadhaar_verified:false,documents:{}};
      if(path.endsWith('step-1-register-details'))state={...state,account_type:body.account_type,current_step:'pan'};
      if(path.endsWith('step-2-pan-verify'))state={...state,pan_verified:true};
      if(path.endsWith('step-4-gst-verify'))state={...state,gst_verified:true};
      if(path.endsWith('upload-document')) {
        assert.ok(body.document instanceof File);assert.equal(body.document.name,`${body.document_type}.pdf`);
        state={...state,documents:{...(state.documents as object),[body.document_type]:{uploaded:true,url:'https://private.example/document',document_number:'PRIVATE_IDENTIFIER'}}};
      }
      if(path.endsWith('final-submit'))state={...state,is_complete:true,kyc_status:1,current_step:'complete'};
      managedStates.set(id,state);data=path.endsWith('step-3-aadhaar-init')?{redirect_url:'https://digilocker.gov.in/fixture'}:state;
    }
    else if (path === '/reseller/kyc/status') {
      assert.ok(clients.some(client => String(client.id) === url.searchParams.get('client_id')));
      data = managedStates.get(url.searchParams.get('client_id')!) ?? { account_type: 'individual', is_complete: verified, kyc_status: verified ? 1 : 0,
        current_step: verified ? 'complete' : 'pan', pan_verified: verified, aadhaar_verified: verified,
        pan_number: 'PRIVATE-PAN-DO-NOT-STORE', aadhaar_number: 'PRIVATE-AADHAAR-DO-NOT-STORE', documents: { pan: { url: 'https://private.example/identity' } } };
    } else if (path === '/reseller/purchase/dids') data = { data: [{ id: 7, did_number: 918012345678, monthly_rate: 299, type_label: 'Landline', country_code: 91 }] };
    else if (path === '/reseller/purchase/lock-did') data = { order_id: 9, locked_dids: [{ did_id: 7, did_number: '+918012345678', monthly_rate: 299 }] };
    else if (path === '/reseller/did/purchased') data = { total: 1, data: [{ id: 7, client_id: ownedByClient, did_number: '+918012345678', status: 2, user_status: 2, is_expired: false, is_user_expired: false }] };
    else if (path === '/reseller/purchase/summary/9') data = { order_id: 9, months: 1, did_count: 1, channel_count: 0,
      total: 299, subtotal: 299, did_cost: 299, channel_cost: 0, discount: 0 };
    else throw new Error('Unexpected VoiceLink mutation or request');
    return Response.json({ status: true, data });
  };
  t.after(async () => {
    delete process.env.VOICELINK_KYC_TERMS_URL; globalThis.fetch = originalFetch; delete process.env.VOICELINK_AUTH_TOKEN;
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
  assert.equal(portal.url, process.env.TELEPHONY_PUBLIC_ORIGIN+'/dashboard/phone?provider=voicelink'); assert.equal(portal.expiresAt, null);
  const kycRequest=(who:typeof a,input:Record<string,unknown>)=>new Request(process.env.BETTER_AUTH_URL+'/api/telephony/voicelink/kyc',{
    method:'POST',headers:who.request('/api/tenant').headers,body:JSON.stringify(input)});
  managedStates.set('502',{account_type:'individual',is_complete:false,kyc_status:0,current_step:'register',pan_verified:false,aadhaar_verified:false,documents:{}});
  assert.equal((await managedGet(new Request(process.env.BETTER_AUTH_URL+'/api/telephony/voicelink/kyc'))).status,401);
  assert.equal((await managedPost(kycRequest(a,{action:'pan',client_id:502,pan:'ABCDE1234F',holderName:'Fixture User'}))).status,400);
  const noOrigin=kycRequest(a,{action:'pan',pan:'ABCDE1234F',holderName:'Fixture User'});noOrigin.headers.delete('origin');assert.equal((await managedPost(noOrigin)).status,403);
  let result=await managedPost(kycRequest(a,{action:'register',accountType:'individual',fullName:'Fixture User',phone:'+919876543210',address:'Synthetic test address',state:'Kerala',city:'Kochi',pincode:'682001',acceptTerms:true}));
  assert.equal(result.status,200);
  result=await managedPost(kycRequest(a,{action:'pan',pan:'ABCDE1234F',holderName:'Fixture User'}));assert.equal(result.status,200);
  const upload=async(type:string)=>{
    const data=new FormData();data.set('documentType',type);data.set('document',new File(['%PDF-1.7\nfixture'],'private-identity.pdf',{type:'application/pdf'}));
    const headers=new Headers(a.request('/api/tenant').headers);headers.delete('content-type');
    return managedUpload(new Request(process.env.BETTER_AUTH_URL+'/api/telephony/voicelink/kyc/upload',{method:'POST',headers,body:data}));
  };
  assert.equal((await upload('pan')).status,200);
  result=await managedPost(kycRequest(a,{action:'aadhaar'}));assert.equal(result.status,200);assert.equal((await result.json()).redirectUrl,'https://digilocker.gov.in/fixture');
  managedStates.set('501',{...managedStates.get('501')!,aadhaar_verified:true});
  assert.equal((await upload('aadhaar')).status,200);
  result=await managedGet(a.request('/api/telephony/voicelink/kyc'));const safe=await result.json();assert.equal(safe.readyForSubmission,true);assert.ok(!JSON.stringify(safe).includes('PRIVATE'));assert.ok(!JSON.stringify(safe).includes('private.example'));
  assert.equal((await managedPost(kycRequest(a,{action:'submit'}))).status,503);
  // Simulate the next minute after the intentionally rejected final submission.
  await query("delete from telephony_rate_limits where tenant_id=$1 and operation='/api/telephony/voicelink/kyc'",[a.tenantId]);
  process.env.VOICELINK_CLIENT_KYC_FINALIZE_VERIFIED='1';
  assert.equal((await managedPost(kycRequest(a,{action:'submit'}))).status,200);delete process.env.VOICELINK_CLIENT_KYC_FINALIZE_VERIFIED;
  assert.ok(kycTargets.every(id=>id==='501'));const bState=await (await managedGet(b.request('/api/telephony/voicelink/kyc'))).json();assert.equal(bState.documents.pan.verified,false);
  const storedKyc=await queryOne('select document_states from tenant_telephony_accounts where tenant_id=$1 and provider=\'voicelink\'',[a.tenantId]);assert.ok(!JSON.stringify(storedKyc).includes('ABCDE1234F'));
  assert.equal((await queryOne<{ kyc_session_id: string | null }>("select kyc_session_id from tenant_telephony_accounts where tenant_id=$1 and provider='voicelink'", [a.tenantId]))!.kyc_session_id, null);
  const providerSecrets = await query("select key_name from tenant_secrets where tenant_id=$1 and provider='voicelink'", [a.tenantId]);
  assert.equal(providerSecrets.length, 0);
  const status = await (await getStatus(a.request('/api/telephony/voicelink'))).json();
  assert.equal(status.quoteSource, 'provider_api'); assert.equal(status.quote.numberMonthlyMinor, 29900); assert.equal(status.quote.channelMonthlyMinor, 19900);
  assert.equal(status.activationReady, false);
  assert.equal(requests.filter(request => request.path === '/reseller/client/create').length, 2);
  assert.ok(!requests.some(request => /purchase|routing|websocket-bot|release/.test(request.path)));
  const quote = await prepareVoiceLinkCheckout(a.tenantId, { e164: '+918012345678', key: 'fixture_checkout_0001' });
  assert.equal(quote.quote?.totalMinor, 29900); assert.equal(quote.confirmationAvailable, false);
  const repeated = await prepareVoiceLinkCheckout(a.tenantId, { e164: '+918012345678', key: 'fixture_checkout_0002' });
  assert.equal(repeated.id, quote.id);
  assert.equal(requests.filter(request => request.path === '/reseller/purchase/lock-did').length, 1);
  assert.equal((await voiceLinkCheckoutStatus(b.tenantId)).checkout, null);
  await assert.rejects(confirmVoiceLinkCheckout(b.tenantId, { id: quote.id, acceptsAutoRenew: true, acceptedChargeMinor: 0 }), /not found/);
  delete process.env.VOICELINK_COMMERCIAL_TERMS_REFERENCE;
  await assert.rejects(confirmVoiceLinkCheckout(a.tenantId, { id: quote.id, acceptsAutoRenew: true, acceptedChargeMinor: 0 }), /operator confirmation/);
  process.env.VOICELINK_COMMERCIAL_TERMS_REFERENCE = 'fixture-confirmed'; process.env.VOICELINK_RELEASE_COST_MINOR = '0'; process.env.VOICELINK_COMMITMENT_MONTHS = '1';
  await assert.rejects(confirmVoiceLinkCheckout(a.tenantId, { id: quote.id, acceptsAutoRenew: true, acceptedChargeMinor: 0, acceptedTermsReference: 'fixture-confirmed', acceptedReleaseMinor: 0, acceptedCommitmentMonths: 1 }), /authentication and controls/);
  assert.ok(!requests.some(request => request.path === '/reseller/purchase/confirm' || request.path === '/reseller/client/map-did'));
  assert.equal((await queryOne<{ count: string }>('select count(*) from wallet_holds where tenant_id=$1', [a.tenantId]))!.count, '0');
  assert.equal((await queryOne<{ count: string }>('select count(*) from phone_numbers where tenant_id=$1', [a.tenantId]))!.count, '0');
  // A summary outage after a durable lock recovers without another POST.
  const originalExpiry = (await voiceLinkCheckoutStatus(a.tenantId)).checkout!.expiresAt;
  await query("update voicelink_checkouts set state='draft_unknown',quote=null where tenant_id=$1", [a.tenantId]);
  const postsBeforeRecovery = requests.filter(request=>request.method==='POST').length;
  assert.equal((await reconcileVoiceLinkCheckout(a.tenantId)).code, 'draft_recovered');
  assert.equal((await voiceLinkCheckoutStatus(a.tenantId)).checkout!.expiresAt?.toString(), originalExpiry?.toString());
  assert.equal(requests.filter(request=>request.method==='POST').length,postsBeforeRecovery);
  await assert.rejects(closeVoiceLinkDraft(a.tenantId, 'SUPPORT-123', false), /confirm/);

  // Simulate an uncertain paid intent in the disposable DB. No readiness bypass
  // or actual confirm request: exact ownership may recover state, never debit.
  const number = await queryOne<{id:string}>(`insert into phone_numbers(tenant_id,telephony_account_id,provider,provider_number_id,e164,status,provisioning_status,customer_monthly_price_minor,initial_charge_minor,idempotency_key)
    select tenant_id,telephony_account_id,'voicelink','7',e164,'failed','purchase_unknown',10000,11000,'fixture_recovery_reservation' from voicelink_checkouts where tenant_id=$1 returning id`, [a.tenantId]);
  await query("insert into wallet_holds(tenant_id,phone_number_id,amount_minor) values($1,$2,11000)",[a.tenantId,number!.id]);
  await query("update voicelink_checkouts set state='purchase_unknown',phone_number_id=$2 where tenant_id=$1",[a.tenantId,number!.id]);
  ownedByClient='502'; // Provider row from tenant B cannot authorize A.
  assert.equal((await reconcileVoiceLinkCheckout(a.tenantId)).code,'ownership_unconfirmed');
  assert.equal((await voiceLinkCheckoutStatus(a.tenantId)).checkout!.state,'purchase_unknown');
  await assert.rejects(closeVoiceLinkDraft(a.tenantId,'SUPPORT-123',true),/uncertain purchase/);
  assert.equal((await reconcileVoiceLinkCheckout(b.tenantId)).state,'none');
  ownedByClient='501';
  assert.equal((await reconcileVoiceLinkCheckout(a.tenantId)).state,'assigned');
  assert.equal((await reconcileVoiceLinkCheckout(a.tenantId)).code,'no_recovery_needed');
  assert.equal((await queryOne<{status:string}>('select status from wallet_holds where tenant_id=$1 and phone_number_id=$2',[a.tenantId,number!.id]))!.status,'reserved');
  assert.equal((await queryOne<{count:string}>("select count(*) from wallet_transactions where tenant_id=$1 and amount_minor<0",[a.tenantId]))!.count,'0');
  assert.equal(requests.filter(request=>request.method==='POST').length,postsBeforeRecovery);
  const snapshot=await adminSnapshot();
  assert.equal(snapshot.filter(row=>row.id===a.tenantId).length,2);
  assert.equal(snapshot.find(row=>row.id===a.tenantId&&row.provider==='voicelink')!.checkout.state,'assigned');
  assert.equal(snapshot.find(row=>row.id===a.tenantId&&row.provider==='vobiz')!.number_id,null);
  await adminAction('fixture-operator',{tenantId:b.tenantId,provider:'voicelink',action:'sync_kyc',reason:'Fixture provider dispatch'});
  assert.equal(requests.filter(request=>request.path==='/reseller/kyc/status').at(-1)!.clientId,'502');
  await assert.rejects(adminAction('fixture-operator',{tenantId:a.tenantId,provider:'voicelink',numberId:number!.id,action:'resume_number',reason:'Cannot activate unverified media'}),/readiness/);

  const c=await workspace('voicelink-db-recovery@example.test');
  await query('update tenant_subscriptions set phone_activation_approved=true where tenant_id=$1',[c.tenantId]);
  await query('update tenant_onboarding set browser_test_completed_at=now() where tenant_id=$1',[c.tenantId]);
  loseClientResponse=true;
  await assert.rejects(ensureCustomerAccount(c.tenantId,c.request('/api/telephony/account','POST'),'voicelink'),/review/);
  loseClientResponse=false;
  const accountPostCount=requests.filter(request=>request.path==='/reseller/client/create').length;
  await assert.rejects(ensureCustomerAccount(c.tenantId,c.request('/api/telephony/account','POST'),'voicelink'),/No second account/);
  assert.equal((await reconcileVoiceLinkAccount(c.tenantId)).recovered,true);
  assert.equal((await reconcileVoiceLinkAccount(c.tenantId)).recovered,true);
  assert.equal(requests.filter(request=>request.path==='/reseller/client/create').length,accountPostCount);
  const recovered=await queryOne<{provider_auth_id:string;kyc_calls_blocked:boolean}>("select provider_auth_id,kyc_calls_blocked from tenant_telephony_accounts where tenant_id=$1 and provider='voicelink'",[c.tenantId]);
  assert.equal(recovered!.provider_auth_id,'503');assert.equal(recovered!.kyc_calls_blocked,true);
  await query("insert into voicelink_checkouts(tenant_id,telephony_account_id,e164,provider_did_id,idempotency_key,state) select tenant_id,id,'+918012345679','8','fixture_unknown_draft','draft_unknown' from tenant_telephony_accounts where tenant_id=$1 and provider='voicelink'",[c.tenantId]);
  assert.equal((await reconcileVoiceLinkCheckout(c.tenantId)).code,'draft_reference_missing');
  await adminAction('fixture-operator',{tenantId:c.tenantId,provider:'voicelink',action:'close_voicelink_draft',providerDraftClosed:true,reference:'SUPPORT-FIXTURE-123',reason:'Provider fixture confirms unpaid closure'});
  assert.equal((await voiceLinkCheckoutStatus(c.tenantId)).checkout,null);
  const d = await workspace('voicelink-manual-owner@example.test');
  await query('update tenant_subscriptions set phone_activation_approved=true where tenant_id=$1', [d.tenantId]);
  await query('update tenant_onboarding set browser_test_completed_at=now() where tenant_id=$1', [d.tenantId]);
  clients.push({ id: 999, username: 'manual.client', email: 'wrong-owner@example.test', currency: 'INR', is_active: 1 });
  const manualLink = { tenantId:d.tenantId, provider:'voicelink', action:'link_voicelink_client', providerClientId:'999',
    reference:'fixture_manual_client_link', reason:'Connect provider client manually created for this workspace owner' };
  await assert.rejects(adminAction('fixture-operator', manualLink), /does not match/);
  assert.equal((await phoneSummary(d.tenantId,'voicelink')).account, null);
  clients[clients.length-1].email = 'voicelink-manual-owner@example.test';
  const postsBeforeLink = requests.filter(request=>request.method==='POST').length;
  await adminAction('fixture-operator', manualLink);
  await adminAction('fixture-operator', manualLink);
  assert.equal(requests.filter(request=>request.method==='POST').length, postsBeforeLink);
  const manual = await queryOne<{provider_auth_id:string;kyc_calls_blocked:boolean}>("select provider_auth_id,kyc_calls_blocked from tenant_telephony_accounts where tenant_id=$1 and provider='voicelink'",[d.tenantId]);
  assert.equal(manual?.provider_auth_id,'999'); assert.equal(manual?.kyc_calls_blocked,true);
  assert.equal((await phoneSummary(d.tenantId,'voicelink')).phoneCallsReady,false);
  await syncKyc(d.tenantId,'voicelink');
  assert.equal((await phoneSummary(d.tenantId,'voicelink')).account?.kycStatus,'verified');
  const audit=await queryOne<{reference:string}>("select reference from platform_audit_events where tenant_id=$1 and action='close_voicelink_draft.completed'",[c.tenantId]);
  assert.equal(audit!.reference,'SUPPORT-FIXTURE-123');
  await query("insert into voicelink_checkouts(tenant_id,telephony_account_id,e164,provider_did_id,idempotency_key,state,updated_at) select tenant_id,id,'+918012345680','9','fixture_scheduled_unknown','draft_unknown',now()-interval '3 minutes' from tenant_telephony_accounts where tenant_id=$1 and provider='voicelink'",[c.tenantId]);
  const postsBeforeJob=requests.filter(request=>request.method==='POST').length;
  const report=await reconcileTelephony();assert.equal(report.voicelinkCheckouts,1);assert.equal(report.voicelinkReviews,1);
  assert.equal(requests.filter(request=>request.method==='POST').length,postsBeforeJob);


});
