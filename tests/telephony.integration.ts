import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {GET as readinessGet} from '@/app/api/admin/telephony/readiness/route';
import {POST as kycSessionPost} from '@/app/api/telephony/kyc/session/route';
import {query,queryOne} from '@/db/client';
import {getTenantGeminiApiKey} from '@/lib/gemini';
import {getTenantGeminiApiKey as bridgeGeminiKey} from '../bridge/gemini.mjs';
import {getAuth} from '@/lib/auth/server';
import {resolveTenantContext} from '@/lib/auth/context';
import {ensureCustomerAccount,syncKyc,startKyc,purchaseNumber,retryNumber,releaseNumber,requestNumberRelease,phoneSummary,searchNumbers} from '@/lib/telephony/service';
import {getNumber,initWallet,wallet} from '@/lib/telephony/store';
import {GET as phoneAccountGet} from '@/app/api/telephony/account/route';
import {GET as knowledgeGet} from '@/app/api/knowledge/route';
import {GET as dashboardGet} from '@/app/api/dashboard/route';
import {GET as profileGet} from '@/app/api/company-profile/route';
import {GET as callsGet} from '@/app/api/calls/route';
import {GET as secretsGet} from '@/app/api/tenant/secrets/route';
import {saveTenantSecret} from '@/lib/tenant/secrets';
import {getTenantSecretValue} from '@/lib/tenant/secrets';
import {adminAction,requirePlatformAdmin,adminSnapshot} from '@/lib/telephony/admin';
import {reconcileTelephony} from '@/lib/telephony/reconcile';
import {answerCall,reconcileCall,callWebhook} from '@/lib/telephony/inbound';
import {POST as retryRoute} from '@/app/api/telephony/numbers/retry/route';
import {POST as kycWebhook} from '@/app/api/webhooks/vobiz/kyc/route';
import {authorizePhoneBridge} from '../bridge/telephony.mjs';
import {verifyBridgeToken} from '../bridge/bridge-token.mjs';

const originalFetch=globalThis.fetch;
let kycSessionFailure=0,inventoryCount=0;
let accountCount=0,purchases=0,configurationFail=false,purchaseTimeout=false,releases=0;
const remote=new Map<string,{blocked:boolean;state:string;owned:any[]}>();
const inventory=(e164:string)=>({id:e164,e164,country:'IN',region:'Kerala',currency:'INR',monthly_fee:'100',setup_fee:'10',voice_enabled:true,status:'active',is_blocked:false,is_trial_number:false,minimum_commitment_months:0});
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.hostname!=='api.vobiz.ai')return originalFetch(input,init);
 const path=url.pathname,body=init?.body?JSON.parse(String(init.body)):{};
 const auth=new Headers(init?.headers).get('X-Auth-ID')!;
 let data:any;
 if(path.endsWith('/sub-accounts/')&&init?.method==='POST'){
  assert.equal(body.kyc_mode,'customer_use');assert.equal(body.business_type,'individual');assert.deepEqual(body.permissions,{calls:true,cdr:true});
  const id=`SA_${++accountCount}`;remote.set(id,{blocked:true,state:'not_started',owned:[]});
  data={sub_account:{id:String(accountCount),enabled:true},auth_credentials:{auth_id:id,auth_token:`secret-${id}`}};
 }else if(path.includes('/kyc/status')){
  const id=path.split('/')[4],r=remote.get(id)!;data={sub_account_id:id,kyc_mode:'customer_use',business_type:'individual',overall_status:r.state,kyc_calls_blocked:r.blocked,verifications:{pan:r.state,aadhaar:r.state}};
 }else if(path.endsWith('/kyc-sessions')){if(kycSessionFailure)return new Response(JSON.stringify({pan:'private-document',token:'private-token'}),{status:kycSessionFailure});data={session_id:'session-'+crypto.randomUUID(),widget_url:'https://kyc.vobiz.ai/s/test',expires_at:new Date(Date.now()+86400000).toISOString(),status:'link_ready'};}
 else if(path.includes('/sub-accounts/')){const id=path.split('/').at(-1)!;data={id:id.slice(3),auth_id:id,enabled:true,is_active:true};}
 else if(path.endsWith('/balance/INR'))data={currency:'INR',status:'active',available_balance:'10000'};
 else if(path.endsWith('/inventory/numbers')){inventoryCount++;data={items:[inventory('+914841234501'),inventory('+914841234502'),inventory('+914841234503')],total:3};}
 else if(path.endsWith('/purchase-from-inventory')){purchases++;const n=inventory(body.e164);remote.get(auth)!.owned.push(n);if(purchaseTimeout){purchaseTimeout=false;throw new Error('simulated timeout after provider commit');}data={number:n};}
 else if(path.endsWith('/Application/'))data={app_id:'app-'+crypto.randomUUID()};
 else if(path.endsWith('/application')){
  if(configurationFail)return new Response('{}',{status:503});
  const n=remote.get(auth)!.owned.find(n=>n.e164===decodeURIComponent(path.split('/').at(-2)!));n.application_id=body.application_id;data={};
 }else if(path.endsWith('/numbers'))data={items:remote.get(auth)!.owned,total:remote.get(auth)!.owned.length};
 else if(init?.method==='DELETE'){releases++;const e164=decodeURIComponent(path.split('/').at(-1)!);remote.get(auth)!.owned.find(n=>n.e164===e164).status='pending_release';data={status:'pending_release',release_fee:700,cooldown_ends_at:new Date(Date.now()+86400000).toISOString()};}
 else if(path.includes('/cdr/'))data={data:{uuid:path.split('/').at(-1),call_direction:'inbound',caller_id_number:'+919876543210',destination_number:remote.get(auth)!.owned[0].e164,start_time:new Date(Date.now()-61000).toISOString(),answer_time:new Date(Date.now()-61000).toISOString(),end_time:new Date().toISOString(),duration:61,billsec:61,total_cost:'0.7',currency:'INR',hangup_cause:'NORMAL_CLEARING'}};
 else if(path.includes('/Call/'))data={call_uuid:path.split('/').at(-1),direction:'inbound',from:'+919876543210',to:remote.get(auth)!.owned[0].e164,call_status:'in-progress'};
 else throw new Error('Unexpected provider request: '+path);
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};

async function signup(name:string){
 const response=await getAuth().handler(new Request(process.env.BETTER_AUTH_URL+'/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:new URL(process.env.BETTER_AUTH_URL!).origin},body:JSON.stringify({name,email:`${name.toLowerCase()}@example.test`,password:'integration-password-123'})}));
 assert.equal(response.status,200,await response.clone().text());
 const cookie=response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const request=new Request(process.env.BETTER_AUTH_URL+'/api/telephony/account',{headers:{cookie}});
 const context=await resolveTenantContext(request);return {request,cookie,...context};
}
function callback(path:string,id:string,to:string,nonce:string,event?:string){
 const url=process.env.TELEPHONY_PUBLIC_ORIGIN+path;
 const signature=createHmac('sha256',process.env.VOBIZ_AUTH_TOKEN!).update(url+'.'+nonce).digest('base64');
 return new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Vobiz-Signature-MA-V3':signature,'X-Vobiz-Signature-V3-Nonce':nonce},body:new URLSearchParams({CallUUID:id,From:'+919876543210',To:to,...(event?{Event:event}:{})})});
}

test('isolated database: auth, KYC gates, provision retries, signed routing and immutable billing',async t=>{
 t.after(async()=>{globalThis.fetch=originalFetch;await globalThis.__keralaiAuthPgPool?.end();const {closePool}=await import('../bridge/db.mjs');await closePool();});
 assert.match(process.env.TEST_SCHEMA!,/^keralai_test_[a-f0-9]+$/);
 const path=await queryOne<{search_path:string}>('show search_path');assert.ok(path!.search_path.startsWith(process.env.TEST_SCHEMA!),'Refuse fixtures outside isolated schema');
 const table=await queryOne<{schema:string}>("select n.nspname as schema from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid='tenants'::regclass");assert.equal(table!.schema,process.env.TEST_SCHEMA);
 const a=await signup('TenantA'),b=await signup('TenantB');assert.notEqual(a.tenantId,b.tenantId);
 await query("update company_profile set name='Private A Profile' where tenant_id=$1",[a.tenantId]);
 await query("insert into knowledge_items(tenant_id,type,title,content) values($1,'text','Private A Knowledge','Only tenant A knows this')",[a.tenantId]);
 await query("insert into calls(tenant_id,call_sid,caller) values($1,'private-a-call','Private A Caller')",[a.tenantId]);
 const aSnapshot=await dashboardGet(new Request(process.env.BETTER_AUTH_URL+'/api/dashboard',{headers:{cookie:a.cookie}}));
 const bSnapshot=await dashboardGet(new Request(process.env.BETTER_AUTH_URL+'/api/dashboard',{headers:{cookie:b.cookie,'x-tenant-id':a.tenantId}}));
 assert.equal(aSnapshot.status,200);assert.equal(bSnapshot.status,200);
 assert.match(JSON.stringify(await aSnapshot.json()),/Private A Knowledge/);
 assert.ok(!JSON.stringify(await bSnapshot.json()).includes('Private A'),'aggregate isolates profile, knowledge and calls');
 await saveTenantSecret({tenantId:a.tenantId,provider:'gemini',keyName:'api_key',value:'private-gemini-A'});
 // An unreadable credential must not crash the phone summary or become usable.
 await query("update tenant_secrets set auth_tag=$2 where tenant_id=$1 and provider='gemini' and key_name='api_key'",[a.tenantId,Buffer.alloc(16).toString('base64')]);
 await assert.rejects(getTenantSecretValue(a.tenantId,'gemini','api_key'),/cannot be decrypted/);
 const repairResponse=await phoneAccountGet(a.request);
 assert.equal(repairResponse.status,200);
 const repairSummary=await repairResponse.json();
 assert.equal(repairSummary.assistantConfigured,false);
 assert.equal(repairSummary.assistantNeedsRepair,true);
 assert.ok(!JSON.stringify(repairSummary).includes('private-gemini-A'));
 await saveTenantSecret({tenantId:a.tenantId,provider:'gemini',keyName:'api_key',value:'private-gemini-A'});
 const restoredSummary=await phoneSummary(a.tenantId);
 assert.equal(restoredSummary.assistantConfigured,true);
 assert.equal(restoredSummary.assistantNeedsRepair,false);
 assert.doesNotThrow(()=>globalThis.__keralaiAuthPgPool!.emit('error',new Error('simulated idle disconnect')));

 assert.equal((await (await knowledgeGet(b.request)).json()).length,0);
 assert.notEqual((await (await profileGet(b.request)).json()).name,'Private A Profile');
 assert.equal((await (await callsGet(b.request)).json()).length,0);
 assert.ok(!JSON.stringify(await (await secretsGet(a.request)).json()).includes('private-gemini-A'));
 assert.ok(!JSON.stringify(await (await secretsGet(b.request)).json()).includes('gemini'));
 // Existing workspaces retain BYOK; alpha fixtures exercise managed keys separately.
 await query("update tenant_ai_configuration set credential_mode='platform_managed' where tenant_id=$1",[b.tenantId]);
 process.env.PLATFORM_GEMINI_API_KEY='fixture-platform-gemini';
 assert.equal(await getTenantGeminiApiKey(a.tenantId),'private-gemini-A');
 assert.equal(await bridgeGeminiKey(b.tenantId),'fixture-platform-gemini');
 assert.equal((await secretsGet(a.request)).status,200);
 delete process.env.PLATFORM_GEMINI_API_KEY;
 assert.equal(await getTenantGeminiApiKey(b.tenantId),null);
 await query("update tenant_ai_configuration set credential_mode='tenant_managed' where tenant_id=$1",[b.tenantId]);

 const parentToken=process.env.VOBIZ_AUTH_TOKEN;delete process.env.VOBIZ_AUTH_TOKEN;
 await assert.rejects(ensureCustomerAccount(a.tenantId,a.request));assert.equal((await query('select id from tenant_telephony_accounts where tenant_id=$1',[a.tenantId])).length,0);
 process.env.VOBIZ_AUTH_TOKEN=parentToken;
 const aa=await ensureCustomerAccount(a.tenantId,a.request),bb=await ensureCustomerAccount(b.tenantId,b.request);
 assert.notEqual(aa.provider_auth_id,bb.provider_auth_id);assert.equal(accountCount,2);
 assert.equal((await ensureCustomerAccount(a.tenantId,a.request)).id,aa.id);assert.equal(accountCount,2);
 assert.equal(await getTenantSecretValue(a.tenantId,'vobiz','auth_token'),'secret-SA_1');
 assert.equal(await getTenantSecretValue(b.tenantId,'vobiz','auth_token'),'secret-SA_2');
 for(const state of ['not_started','pending','failed','verified']){
  remote.get('SA_1')!.state=state;remote.get('SA_1')!.blocked=true;await syncKyc(a.tenantId);
  await assert.rejects(purchaseNumber(a.tenantId,{e164:'+914841234501',key:crypto.randomUUID()}));
 }assert.equal(purchases,0);
 const session1=await startKyc(a.tenantId);assert.match(session1.url,/^https:\/\/kyc.vobiz.ai/);
 await query("update tenant_telephony_accounts set kyc_session_expires_at=now()-interval '1 day' where tenant_id=$1",[a.tenantId]);
 const old=await queryOne<{kyc_session_id:string}>('select kyc_session_id from tenant_telephony_accounts where tenant_id=$1',[a.tenantId]);
 await startKyc(a.tenantId);const current=await queryOne<{kyc_session_id:string}>('select kyc_session_id from tenant_telephony_accounts where tenant_id=$1',[a.tenantId]);assert.notEqual(current!.kyc_session_id,old!.kyc_session_id);
 remote.get('SA_1')!.blocked=false;
 const payload=JSON.stringify({event:'kyc.completed',account_auth_id:'SA_1',session_id:current!.kyc_session_id,session_status:'kyc_completed'});
 const webhook=()=>new Request('https://app.example/api/webhooks/vobiz/kyc',{method:'POST',headers:{'X-Vobiz-Signature':'sha256='+createHmac('sha256','parent-test-secret').update(payload).digest('hex')},body:payload});
 assert.equal((await kycWebhook(webhook())).status,204);assert.equal((await kycWebhook(webhook())).status,204);
 assert.equal((await phoneSummary(b.tenantId)).account!.callsBlocked,true);
 await initWallet(a.tenantId);await query("insert into wallet_transactions(tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key) values($1,'adjustment',100000,'fixture','test','fixture-credit')",[a.tenantId]);
 // Pricing/funding rejection occurs before any hold or provider purchase.
 const eligible=await searchNumbers(a.tenantId,{search:'',page:1});assert.equal(eligible.items.length,3);assert.equal(eligible.hasMore,false);
 process.env.ALPHA_MAX_DID_MONTHLY_COST_MINOR='9999';
 const reviewed=await searchNumbers(a.tenantId,{search:'',page:1});assert.equal(reviewed.items.length,0);assert.equal(reviewed.excluded.exposure,3);assert.equal(reviewed.total,3);
 process.env.ALPHA_MAX_DID_MONTHLY_COST_MINOR='10000';
 const beforeInventory=inventoryCount,releasePolicy=process.env.ALPHA_DID_RELEASE_COST_MINOR;delete process.env.ALPHA_DID_RELEASE_COST_MINOR;
 await assert.rejects(searchNumbers(a.tenantId,{search:'',page:1}),/funding policy/);assert.equal(inventoryCount,beforeInventory);
 process.env.ALPHA_DID_RELEASE_COST_MINOR=releasePolicy;
 kycSessionFailure=404;
 const failedSession=await kycSessionPost(new Request('https://app.example/api/telephony/kyc/session',{method:'POST',headers:{cookie:a.cookie,origin:'https://app.example'},body:'{}'}));
 assert.equal(failedSession.status,503);const failure=await failedSession.json();assert.match(failure.error,/could not find/);assert.match(failure.requestId,/^[a-f0-9-]{36}$/);
 assert.ok(!JSON.stringify(failure).includes('private-document'));assert.ok(!JSON.stringify(failure).includes('private-token'));kycSessionFailure=0;
 process.env.ALPHA_MAX_DID_MONTHLY_COST_MINOR='9999';
 await assert.rejects(purchaseNumber(a.tenantId,{e164:'+914841234501',key:crypto.randomUUID()}),/approved Alpha exposure/);
 process.env.ALPHA_MAX_DID_MONTHLY_COST_MINOR='10000';
 process.env.ALPHA_MIN_VOBIZ_BALANCE_MINOR='999999';
 await assert.rejects(purchaseNumber(a.tenantId,{e164:'+914841234501',key:crypto.randomUUID()}),/operator funds service/);
 process.env.ALPHA_MIN_VOBIZ_BALANCE_MINOR='10000';
 const providerCap=await queryOne<{monthly_provider_cap_minor:string}>('select monthly_provider_cap_minor from platform_usage_controls where id=1');
 await query('update platform_usage_controls set monthly_provider_cap_minor=10000 where id=1');
 await assert.rejects(purchaseNumber(a.tenantId,{e164:'+914841234501',key:crypto.randomUUID()}),/provider allowance/);
 await query('update platform_usage_controls set monthly_provider_cap_minor=$1 where id=1',[providerCap!.monthly_provider_cap_minor]);
 assert.equal(purchases,0);assert.equal((await wallet(a.tenantId)).heldMinor,0);
 assert.equal((await phoneSummary(a.tenantId)).phoneCallsReady,false,'no active DID means calls are not ready');
 configurationFail=true;
 await assert.rejects(purchaseNumber(a.tenantId,{e164:'+914841234501',key:crypto.randomUUID()}));
 const number=(await query('select * from phone_numbers where tenant_id=$1',[a.tenantId]))[0];assert.equal(number.provisioning_status,'configuration_failed');assert.equal(purchases,1);assert.equal((await wallet(a.tenantId)).heldMinor,11000);
 assert.equal(Number(number.provider_exposure_minor),11000,'DID exposure is reserved before paid mutation');
 process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED='0';
 await assert.rejects(retryNumber(a.tenantId,number.id),/provider readiness/);assert.equal((await getNumber(a.tenantId,number.id))!.status,'failed');
 process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED='1';
 configurationFail=false;await retryNumber(a.tenantId,number.id);
 await purchaseNumber(a.tenantId,{e164:number.e164,key:crypto.randomUUID()});assert.equal(purchases,1);assert.equal((await wallet(a.tenantId)).heldMinor,0);
 assert.equal((await phoneSummary(a.tenantId)).phoneCallsReady,true);
 process.env.PLATFORM_NEW_PHONE_CALLS_ENABLED='0';assert.equal((await phoneSummary(a.tenantId)).phoneCallsReady,false,'display readiness uses the actual admission gate');process.env.PLATFORM_NEW_PHONE_CALLS_ENABLED='1';
 const initialLedger=await query("select type,amount_minor from wallet_transactions where tenant_id=$1 and reference_id=$2 order by type",[a.tenantId,number.id]);
 assert.deepEqual(initialLedger.map(r=>[r.type,Number(r.amount_minor)]),[['number_rental',-10000],['number_setup',-1000]]);
 assert.equal(await getNumber(b.tenantId,number.id),null);
 await assert.rejects(requestNumberRelease(b.tenantId,number.id,b.userId),/not found/);
 await requestNumberRelease(a.tenantId,number.id,a.userId);await requestNumberRelease(a.tenantId,number.id,a.userId);
 assert.equal(releases,0,'customer request does not perform paid release');
 assert.equal((await phoneSummary(a.tenantId)).numbers[0].releaseRequested,true);
 assert.equal((await query("select id from platform_audit_events where tenant_id=$1 and action='tenant.number.release_requested'",[a.tenantId])).length,1);
 const cross=await retryRoute(new Request(process.env.BETTER_AUTH_URL+'/api/telephony/numbers/retry',{method:'POST',headers:{cookie:b.cookie,origin:new URL(process.env.BETTER_AUTH_URL!).origin,'Content-Type':'application/json'},body:JSON.stringify({id:number.id,tenantId:a.tenantId})}));assert.equal(cross.status,404);
 await assert.rejects(requirePlatformAdmin(a.request));
 const previousAdmins=process.env.PLATFORM_ADMIN_USER_IDS;process.env.PLATFORM_ADMIN_USER_IDS=a.userId;
 const unauth=await readinessGet(new Request('https://app.example/api/admin/telephony/readiness'));assert.equal(unauth.status,401);
 const memberReadiness=await readinessGet(new Request('https://app.example/api/admin/telephony/readiness',{headers:{cookie:b.cookie}}));assert.equal(memberReadiness.status,403);
 const readiness=await readinessGet(new Request(`https://app.example/api/admin/telephony/readiness?tenantId=${b.tenantId}`,{headers:{cookie:a.cookie}}));assert.equal(readiness.status,200);
 const readinessData=await readiness.json();assert.equal(readinessData.checks.find((c:any)=>c.key==='migration016').ready,true);assert.equal(readinessData.checks.find((c:any)=>c.key==='kyc').ready,false);
 assert.equal(readinessData.bridge.status,'not_checked');assert.equal(readinessData.liveProviderAcceptance,'NOT_VALIDATED');assert.ok(!JSON.stringify(readinessData).includes('secret-SA'));
 if(previousAdmins===undefined)delete process.env.PLATFORM_ADMIN_USER_IDS;else process.env.PLATFORM_ADMIN_USER_IDS=previousAdmins;

 await query("update tenant_memberships set role='member' where user_id=$1 and tenant_id=$2",[b.userId,b.tenantId]);
 assert.equal((await retryRoute(new Request(process.env.BETTER_AUTH_URL+'/api/telephony/numbers/retry',{method:'POST',headers:{cookie:b.cookie,origin:new URL(process.env.BETTER_AUTH_URL!).origin},body:JSON.stringify({id:number.id})}))).status,403);
 await assert.rejects(resolveTenantContext(new Request('https://app.example/api/telephony/account')));
 const callId=crypto.randomUUID(),answer=callback('/api/telephony/vobiz/answer',callId,number.e164,'answer-12345678');
 process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED='0';await assert.rejects(answerCall(answer),/Unavailable/);
 process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED='1';
 const fresh=()=>callback('/api/telephony/vobiz/answer',crypto.randomUUID(),number.e164,crypto.randomUUID());
 await query("update tenant_subscriptions set status='suspended' where tenant_id=$1",[a.tenantId]);await assert.rejects(answerCall(fresh()),/inactive/);
 await query("update tenant_subscriptions set status='active',voice_enabled=false where tenant_id=$1",[a.tenantId]);await assert.rejects(answerCall(fresh()),/disabled/);
 await query("update tenant_subscriptions set voice_enabled=true,spend_cap_minor=0 where tenant_id=$1",[a.tenantId]);await assert.rejects(answerCall(fresh()),/allowance/);
 await query("update tenant_subscriptions set spend_cap_minor=null where tenant_id=$1",[a.tenantId]);
 await query('update platform_usage_controls set phone_enabled=false where id=1');await assert.rejects(answerCall(fresh()),/readiness/);
 await query('update platform_usage_controls set phone_enabled=true where id=1');
 await query("update wallet_accounts set status='suspended' where tenant_id=$1",[a.tenantId]);await assert.rejects(answerCall(fresh()),/Unavailable/);
 await query("update wallet_accounts set status='active' where tenant_id=$1",[a.tenantId]);
 const xml=await answerCall(answer);const token=new URL(xml.match(/wss:[^<]+/)![0].replaceAll('&amp;','&')).searchParams.get('token')!;
 const verified=verifyBridgeToken(token,'phone');assert.equal(verified.ok,true);
 process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED='0';assert.equal(await authorizePhoneBridge(verified.payload),null,'disabled gate blocks phone without consuming token');
 process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED='1';
 const routed=await authorizePhoneBridge(verified.payload);assert.equal(routed.tenant.id,a.tenantId);
 assert.equal(await authorizePhoneBridge(verified.payload),null,'one-use bridge nonce');
 await assert.rejects(answerCall(fresh()),/Another voice session/);
 const ended=()=>callback('/api/webhooks/vobiz/calls',callId,number.e164,'end-12345678','Hangup');
 await callWebhook(ended());await callWebhook(ended());await reconcileCall(a.tenantId,callId);
 const charges=await query('select * from wallet_transactions where tenant_id=$1 and type=$2',[a.tenantId,'call_usage']);assert.equal(charges.length,1);assert.equal(Number(charges[0].amount_minor),-200);
 const settled=await queryOne<{used_seconds:number;provider_actual_minor:string;settlement:string}>('select * from alpha_voice_sessions where tenant_id=$1 and provider_call_id=$2',[a.tenantId,callId]);
 assert.equal(settled!.settlement,'settled');assert.equal(settled!.used_seconds,120);assert.equal(Number(settled!.provider_actual_minor),70);
 assert.equal((await wallet(a.tenantId)).heldMinor,0);
 assert.equal((await query('select * from telephony_usage_events where tenant_id=$1',[b.tenantId])).length,0);
 await assert.rejects(query('update wallet_transactions set amount_minor=0 where tenant_id=$1',[a.tenantId]),/append-only/);
 await releaseNumber(a.tenantId,number.id);assert.equal((await getNumber(a.tenantId,number.id))!.status,'releasing');
 await releaseNumber(a.tenantId,number.id);assert.equal(releases,1,'pending release never repeats paid DELETE');
 remote.get('SA_1')!.owned=[]; // Provider completes the cooldown; reconcile its confirmed absence.
 await releaseNumber(a.tenantId,number.id);assert.equal(releases,1);assert.equal((await getNumber(a.tenantId,number.id))!.status,'released');
 purchaseTimeout=true;
 await assert.rejects(purchaseNumber(a.tenantId,{e164:'+914841234503',key:crypto.randomUUID()}));
 const uncertain=(await query("select * from phone_numbers where tenant_id=$1 and status<>'released'",[a.tenantId]))[0];assert.equal(uncertain.provisioning_status,'purchase_unknown');
 await retryNumber(a.tenantId,uncertain.id);assert.equal(purchases,2,'uncertain purchase reconciled without a second debit');
 await adminAction(a.userId,{tenantId:b.tenantId,reason:'Fixture promotional credit',action:'credit',amountMinor:500,reference:'credit-test-reference-123'});await adminAction(a.userId,{tenantId:b.tenantId,reason:'Fixture promotional credit',action:'credit',amountMinor:500,reference:'credit-test-reference-123'});assert.equal((await wallet(b.tenantId)).balanceMinor,500);
 remote.get('SA_2')!.state='verified';remote.get('SA_2')!.blocked=false;
 await adminAction(a.userId,{tenantId:b.tenantId,reason:'Fixture promotional credit',action:'credit',amountMinor:100000,reference:'second-tenant-credit-123'});
 await assert.rejects(purchaseNumber(b.tenantId,{e164:'+914841234502',key:crypto.randomUUID()}),/Connect your AI account/);assert.equal(purchases,2);assert.equal((await wallet(b.tenantId)).heldMinor,0);
 await saveTenantSecret({tenantId:b.tenantId,provider:'gemini',keyName:'api_key',value:'private-gemini-B'});
 const bNumber=await purchaseNumber(b.tenantId,{e164:'+914841234502',key:crypto.randomUUID()});
 assert.ok(bNumber);assert.equal(bNumber!.tenant_id,b.tenantId);
 const bCall=crypto.randomUUID();const bXml=await answerCall(callback('/api/telephony/vobiz/answer',bCall,bNumber!.e164,'answer-b-12345678'));
 const bToken=new URL(bXml.match(/wss:[^<]+/)![0].replaceAll('&amp;','&')).searchParams.get('token')!;
 const bVerified=verifyBridgeToken(bToken,'phone');assert.ok(bVerified.ok);
 const bRouting=await authorizePhoneBridge(bVerified.payload);assert.equal(bRouting.tenant.id,b.tenantId);
 assert.equal(await authorizePhoneBridge({...bVerified.payload,tid:a.tenantId}),null,'signed number/account must belong to resolved tenant');
 await callWebhook(callback('/api/webhooks/vobiz/calls',bCall,bNumber!.e164,'end-b-12345678','Hangup'));
 const bCharges=await query("select amount_minor from wallet_transactions where tenant_id=$1 and type='call_usage'",[b.tenantId]);assert.equal(bCharges.length,1);assert.equal(Number(bCharges[0].amount_minor),-200);
 const snapshot=await adminSnapshot();assert.equal(snapshot.find(row=>row.id===b.tenantId)!.recent_usage.length,1);
 await query("update phone_numbers set next_rental_at=now()-interval '1 second' where tenant_id in ($1,$2) and status='active'",[a.tenantId,b.tenantId]);
 assert.equal((await reconcileTelephony()).rentals,2);assert.equal((await reconcileTelephony()).rentals,0,'a due period cannot charge twice');
 const remaining=(await wallet(a.tenantId)).balanceMinor;
 await query("insert into wallet_transactions(tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key) values($1,'adjustment',$2,'fixture','low-balance','fixture-low-balance')",[a.tenantId,50-remaining]);
 await query("update phone_numbers set next_rental_at=now()-interval '1 second' where tenant_id=$1 and id=$2",[a.tenantId,uncertain.id]);
 await reconcileTelephony();assert.equal((await getNumber(a.tenantId,uncertain.id))!.status,'suspended');
 await assert.rejects(adminAction(a.userId,{tenantId:a.tenantId,numberId:uncertain.id,reason:'Fixture rental recovery',action:'resume_number'}),/Rental must be reconciled/);
 await adminAction(a.userId,{tenantId:a.tenantId,reason:'Fixture promotional credit',action:'credit',amountMinor:20000,reference:'rental-resume-credit-123'});assert.equal((await reconcileTelephony()).rentals,1);
 await adminAction(a.userId,{tenantId:a.tenantId,numberId:uncertain.id,reason:'Fixture rental recovery',action:'resume_number'});assert.equal((await getNumber(a.tenantId,uncertain.id))!.status,'active');
});
