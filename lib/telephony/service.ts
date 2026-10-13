import {didExposure,didPolicy,InventoryReviewError,assertParentFunding} from './did-policy';
import { AlphaAccessError } from '@/bridge/alpha-policy.mjs';
import { requireCapability,authorizeUsage } from '@/lib/alpha/entitlements';
import { isPlatformManagedAi } from '@/lib/gemini';
import { getTenantGeminiApiKey } from '@/lib/gemini';
import { query, queryOne } from '@/db/client';
import { transaction } from '@/db/transaction';
import { encryptSecret,SecretDecryptionError } from '@/lib/tenant/secrets';
import { HttpError, getSession } from '@/lib/auth/context';
import { getTelephonyProvider } from './provider';
import { ProviderError } from './errors';
import { assertActivationAllowed, normalizeE164, operationKey, price, publicOrigin } from './policy';
import { getAccount, getNumber, getNumbers, wallet, withOperationLock, reserveNumber, activateNumber, requireActiveTenant, observe } from './store';
import type { AccountRef, PhoneNumberRow, TelephonyAccountRow } from './types';

function ref(account: TelephonyAccountRow): AccountRef {
  if (!account.provider_auth_id) throw new HttpError(409, 'Phone setup needs support. Please contact us.');
  return { tenantId: account.tenant_id, authId: account.provider_auth_id, accountId: account.provider_account_id ?? undefined };
}
export async function requirePhoneSetupEligibility(tenantId:string) {
 const row=await queryOne<{plan_code:string;status:string;phone_activation_approved:boolean;browser_test_completed_at:string|null}>(`select s.plan_code,s.status,s.phone_activation_approved,o.browser_test_completed_at
 from tenant_subscriptions s left join tenant_onboarding o on o.tenant_id=s.tenant_id where s.tenant_id=$1`,[tenantId]);
 if(!row||row.status!=='active')throw new HttpError(403,'Your plan is inactive. Contact your organiser.');
 if(row.plan_code==='alpha') {
  if(!row.phone_activation_approved)throw new HttpError(403,'Phone setup needs Alpha operator approval.');
  if(!row.browser_test_completed_at)throw new HttpError(409,'Test your assistant in the browser before identity verification.');
 }
}
export async function ensureCustomerAccount(tenantId: string, request: Request, providerName = 'vobiz') {
  await requireActiveTenant(tenantId);
  return withOperationLock(tenantId, async () => {
    const existing = await getAccount(tenantId, providerName);
    if (existing?.provider_auth_id) return existing;
    if (existing) throw new HttpError(409, 'Phone setup needs support. No second account will be created.');
    await requirePhoneSetupEligibility(tenantId);
    const session = await getSession(request);
    if (!session?.user.email) throw new HttpError(400, 'An email address is required for identity verification.');
    const tenant = await queryOne<{ name: string }>('select name from tenants where id=$1',[tenantId]);
    const provider=getTelephonyProvider(providerName);
    if(!provider.configured) throw new HttpError(503,'Phone setup is not available yet.');
    const accountInput = { name: providerName === 'voicelink' ? session.user.name ?? '' : tenant?.name ?? 'KeralAI customer', email: session.user.email };
    await provider.preflightCustomerAccount?.(accountInput);
    const row = await queryOne<TelephonyAccountRow>(`insert into tenant_telephony_accounts (tenant_id,provider)
      values ($1,$2) returning *`,[tenantId,provider.name]);
    if (!row) throw new HttpError(503, 'Phone setup is unavailable');
    try {
      const created = await provider.createCustomerAccount(accountInput);
      if (providerName === 'vobiz' && !created.authToken) throw new ProviderError('missing_runtime_credential',true);
      const secret = created.authToken ? encryptSecret(created.authToken) : null;
      await transaction(async (client) => {
        if (secret) await client.query(`insert into tenant_secrets (tenant_id,provider,key_name,ciphertext,iv,auth_tag,key_version)
          values ($1,$6,'auth_token',$2,$3,$4,$5) on conflict (tenant_id,provider,key_name)
          do update set ciphertext=excluded.ciphertext,iv=excluded.iv,auth_tag=excluded.auth_tag,updated_at=now()`,
          [tenantId,secret.ciphertext,secret.iv,secret.authTag,secret.keyVersion,provider.name]);
        await client.query(`update tenant_telephony_accounts set provider_account_id=$2,provider_auth_id=$3,
          status=$4,updated_at=now() where tenant_id=$1 and id=$5`,[tenantId,created.accountId,created.authId,created.enabled ? 'active':'suspended',row.id]);
      });
      observe(`${providerName}.subaccount.created`,tenantId,row.id);
      return (await getAccount(tenantId, providerName))!;
    } catch (error) {
      await query("update tenant_telephony_accounts set status='needs_review',error_code=$2,updated_at=now() where tenant_id=$1 and id=$3",
        [tenantId,error instanceof ProviderError ? error.code : 'persist_failed',row.id]);
      throw new HttpError(503,'Phone account setup needs review. Contact support before retrying.');
    }
  });
}
export async function syncKyc(tenantId: string, providerName = 'vobiz') {
  const account = await getAccount(tenantId, providerName);
  if (!account) throw new HttpError(409,'Start phone setup first.');
  const provider = getTelephonyProvider(account.provider);
  const checkedAt = new Date().toISOString();
  const [status, remote] = await Promise.all([provider.getKycStatus(ref(account)),provider.getCustomerAccount(ref(account))]);
  await query(`update tenant_telephony_accounts set kyc_status=$2,kyc_calls_blocked=$3,document_states=$4::jsonb,
    kyc_last_checked_at=$7,kyc_verified_at=case when $3=false then coalesce(kyc_verified_at,now()) else null end,
    status=$5,updated_at=now()
    where tenant_id=$1 and id=$6 and (kyc_last_checked_at is null or kyc_last_checked_at<=$7)`,[tenantId,status.status,status.callsBlocked,JSON.stringify(status.documents),remote.enabled ? 'active':'suspended',account.id,checkedAt]);
  observe(`${providerName}.kyc.${status.status}`,tenantId,account.id);
  return status;
}
export async function startKyc(tenantId: string, providerName = 'vobiz') {
  await requireActiveTenant(tenantId);
  await requirePhoneSetupEligibility(tenantId);
  return withOperationLock(tenantId,async () => {
    const account = await getAccount(tenantId, providerName);
    if (!account) throw new HttpError(409,'Start phone setup first.');
    if (account.status !== 'active') throw new HttpError(409,'Phone setup needs support.');
    const origin = publicOrigin();
    const session = await getTelephonyProvider(account.provider).createKycSession(ref(account), {
      returnUrl: `${origin}/dashboard/phone?verification=return`, webhookUrl: `${origin}/api/webhooks/vobiz/kyc`,
    });
    await query(`update tenant_telephony_accounts set kyc_session_id=$2,kyc_session_status=$3,
      kyc_session_expires_at=$4,updated_at=now() where tenant_id=$1 and id=$5`,[tenantId,session.id,session.status,session.expiresAt,account.id]);
    observe(`${providerName}.kyc.started`,tenantId,account.id);
    // Widget URL is returned once to the authenticated owner; never stored/logged.
    return { url: session.url, expiresAt: session.expiresAt };
  });
}
export async function searchNumbers(tenantId: string, input: { search: string; page: number }) {
  await requireCapability(tenantId,'number_purchase');
  await requireActiveTenant(tenantId);
  const account = await getAccount(tenantId);
  assertActivationAllowed(account);
  // Global configuration errors must not masquerade as empty inventory.
  const policy=didPolicy();
  const monthlyPriceMinor = price('PHONE_MONTHLY_PRICE_MINOR');
  const setupPriceMinor = price('PHONE_SETUP_PRICE_MINOR');
  const data = await getTelephonyProvider().searchAvailableNumbers(input);
  const excluded={metadata:0,pricing:0,exposure:0};
  const items=[];
  for(const n of data.items) {
    try{didExposure(n,policy);items.push({e164:n.e164,region:n.region,monthlyPriceMinor,setupPriceMinor});}
    catch(error){if(!(error instanceof InventoryReviewError))throw error;excluded[error.reason]++;}
  }
  // total refers to provider inventory before policy filtering, not eligible DIDs.
  return {...data,items,excluded,hasMore:data.page*25<data.total};
}
async function reconcilePurchase(account: TelephonyAccountRow, number: PhoneNumberRow) {
  const provider = getTelephonyProvider(account.provider);
  // An uncertain purchase is never re-issued. Exhaust owned inventory; absence
  // can be eventual consistency, so keep the hold and escalate for review.
  for (let page=1; page<=100; page++) {
    const owned = await provider.listOwnedNumbers(ref(account),page);
    const match = owned.items.find((n) => n.e164 === number.e164);
    if (match) {
      await query(`update phone_numbers set provider_number_id=$3,status='configuring',provisioning_status='purchased',
        error_code=null,updated_at=now() where tenant_id=$1 and id=$2`,[number.tenant_id,number.id,match.id]);
      return;
    }
    if (page*100 >= owned.total || owned.items.length===0) break;
  }
  throw new HttpError(409,'We are confirming your reservation. Your balance is held safely; contact support if this persists.');
}
async function configureNumber(account: TelephonyAccountRow, number: PhoneNumberRow) {
  const provider = getTelephonyProvider(account.provider);
  if (!provider.activationReady) throw new HttpError(503,'Phone activation is awaiting provider readiness checks.');
  const origin = publicOrigin();
  let appId = number.application_id;
  try {
    if (!appId) {
      appId = await provider.createInboundApplication(ref(account),`keralai-${number.id}`, {
        answer: `${origin}/api/telephony/vobiz/answer`, hangup: `${origin}/api/webhooks/vobiz/calls`,
      });
      await query('update phone_numbers set application_id=$3,updated_at=now() where tenant_id=$1 and id=$2',[number.tenant_id,number.id,appId]);
    }
    await query("update phone_numbers set status='configuring',provisioning_status='configuring',updated_at=now() where tenant_id=$1 and id=$2",[number.tenant_id,number.id]);
    await provider.configureInboundRouting(ref(account),number.e164,appId);
    if (!await provider.verifyInboundRouting(ref(account),number.e164,appId)) throw new ProviderError('routing_unconfirmed');
    await syncKyc(number.tenant_id, account.provider);
    assertActivationAllowed(await getAccount(number.tenant_id, account.provider));
    await requireActiveTenant(number.tenant_id);
    if(!await getTenantGeminiApiKey(number.tenant_id)) throw new HttpError(409,'Connect your AI account before completing phone setup.');
    if (!provider.activationReady) throw new HttpError(503,'Phone activation is awaiting provider readiness checks.');
    await activateNumber(number.tenant_id,number.id);
    observe('vobiz.number.activated',number.tenant_id,number.id);
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : 'configuration_failed';
    await query("update phone_numbers set status='failed',provisioning_status='configuration_failed',error_code=$3,updated_at=now() where tenant_id=$1 and id=$2",[number.tenant_id,number.id,code]);
    observe('vobiz.number.failed',number.tenant_id,number.id,code);
    throw new HttpError(503,'Your number is reserved. Assistant connection needs another attempt; use Retry setup.');
  }
}
export async function purchaseNumber(tenantId: string, input: { e164: unknown; key: unknown }) {
  await requireCapability(tenantId,'number_purchase');
  const e164 = normalizeE164(input.e164), key = operationKey(input.key);
  await requireActiveTenant(tenantId);
  return withOperationLock(tenantId,async () => {
    let number = (await getNumbers(tenantId))[0];
    if (number) {
      if (number.e164 !== e164) throw new HttpError(409,'Finish your current phone setup before choosing another number.');
      return retryNumberUnlocked(tenantId,number.id);
    }
    await syncKyc(tenantId);
    const account = (await getAccount(tenantId))!;
    assertActivationAllowed(account);
    const inventory = await getTelephonyProvider().searchAvailableNumbers({ search: e164, page:1 });
    const selected = inventory.items.find((n) => n.e164===e164 && n.country==='IN' && n.currency==='INR' && n.voice);
    if (!selected) throw new HttpError(409,'That number is no longer available. Choose another.');
    const exposure=didExposure(selected);
    const parentBalance=await getTelephonyProvider().getPlatformBalance();
    assertParentFunding(parentBalance,exposure);
    // Validate public callback configuration before spending provider funds.
    publicOrigin();
    if (!getTelephonyProvider(account.provider).activationReady) throw new HttpError(503,'Phone activation is awaiting provider readiness checks.');
    if (!process.env.BRIDGE_PUBLIC_URL || !process.env.BRIDGE_AUTH_SECRET) throw new HttpError(503,'Phone activation is unavailable.');
    if(!await getTenantGeminiApiKey(tenantId)) throw new HttpError(409,'Connect your AI account and test your assistant before activating phone calls.');
    const monthlyPrice = price('PHONE_MONTHLY_PRICE_MINOR'), setup = price('PHONE_SETUP_PRICE_MINOR');
    number = await reserveNumber({ tenantId,accountId:account.id,provider:account.provider,e164,region:selected.region,providerNumberId:selected.id,
      monthlyCost:selected.monthlyCost,monthlyPrice,setupPrice:setup,providerExposure:exposure,parentBalance,charge:monthlyPrice+setup,key });
    observe('vobiz.number.provisioning',tenantId,number.id);
    try {
      const purchased = await getTelephonyProvider().purchaseNumber(ref(account),e164);
      if (purchased.e164 !== e164) throw new ProviderError('purchase_mismatch',true);
      await query(`update phone_numbers set provider_number_id=$3,status='configuring',provisioning_status='purchased',updated_at=now()
        where tenant_id=$1 and id=$2`,[tenantId,number.id,purchased.id]);
    } catch (error) {
      // Even a provider 500 can hide an applied debit. Never blindly retry.
      await query("update phone_numbers set status='failed',provisioning_status='purchase_unknown',error_code=$3,updated_at=now() where tenant_id=$1 and id=$2",
        [tenantId,number.id,error instanceof ProviderError ? error.code : 'persist_failed']);
      throw new HttpError(503,'We are confirming your number reservation. Use Check setup; your balance has not been charged.');
    }
    await configureNumber(account,(await getNumber(tenantId,number.id))!);
    return getNumber(tenantId,number.id);
  });
}
async function retryNumberUnlocked(tenantId: string, id: string) {
  const number = await getNumber(tenantId,id);
  if (!number) throw new HttpError(404,'Phone number not found');
  if (!getTelephonyProvider(number.provider).activationReady) throw new HttpError(503,'Phone activation is awaiting provider readiness checks.');
  if (number.status==='active') return number;
  if (number.status==='released' || number.status==='releasing' || number.status==='suspended') throw new HttpError(409,'This number cannot be activated. Contact support.');
  const account = (await getAccount(tenantId, number.provider))!;
  await syncKyc(tenantId, number.provider);
  assertActivationAllowed(await getAccount(tenantId, number.provider));
  if (['purchase_unknown','purchasing'].includes(number.provisioning_status)) await reconcilePurchase(account,number);
  await configureNumber(account,(await getNumber(tenantId,id))!);
  return getNumber(tenantId,id);
}
export async function retryNumber(tenantId: string, id: string) {
  await requireCapability(tenantId,'number_purchase');
  await requireActiveTenant(tenantId);
  return withOperationLock(tenantId,() => retryNumberUnlocked(tenantId,id));
}
export async function phoneSummary(tenantId: string, providerName = 'vobiz') {
  const assistantState = getTenantGeminiApiKey(tenantId)
    .then(key => ({ configured:!!key, needsRepair:false }))
    .catch(error => {
      if(error instanceof AlphaAccessError && [403,503].includes(error.status))return {configured:false,needsRepair:false};
      if (!(error instanceof SecretDecryptionError)) throw error;
      return { configured:false, needsRepair:true };
    });
  const [account,numbers,balance,assistant,subscription,phoneDecision] = await Promise.all([getAccount(tenantId, providerName),getNumbers(tenantId, providerName),wallet(tenantId),assistantState,queryOne<{plan_code:string;phone_activation_approved:boolean;browser_test_completed_at:string|null}>(`select s.plan_code,s.phone_activation_approved,o.browser_test_completed_at from tenant_subscriptions s left join tenant_onboarding o on o.tenant_id=s.tenant_id where s.tenant_id=$1`,[tenantId]),authorizeUsage(tenantId,'phone_inbound')]);
  return { account: account ? { kycStatus: account.kyc_status, callsBlocked: account.kyc_calls_blocked,
    documents: account.document_states, status:account.status, sessionStatus:account.kyc_session_status,
    sessionExpiresAt:account.kyc_session_expires_at, lastCheckedAt:account.kyc_last_checked_at } : null,
    numbers: numbers.map((n) => ({ id:n.id,e164:n.e164,region:n.region,status:n.status,provisioningStatus:n.provisioning_status,
      releaseRequested:!!n.release_requested_at,monthlyPriceMinor:Number(n.customer_monthly_price_minor) })), wallet:balance,
    phoneActivationApproved:!!subscription&&(subscription.plan_code!=='alpha'||subscription.phone_activation_approved),
    browserTestCompleted:!!subscription&&(subscription.plan_code!=='alpha'||!!subscription.browser_test_completed_at),
    phoneCallsReady:getTelephonyProvider(providerName).activationReady&&phoneDecision.allowed&&numbers.some(n=>n.status==='active')&&account?.status==='active'&&account.kyc_calls_blocked===false&&assistant.configured&&balance.status==='active'&&balance.availableMinor>0,
    phoneReadinessReason:phoneDecision.allowed?null:phoneDecision.reason,
    kycAvailable:getTelephonyProvider(providerName).configured&&(()=>{try{publicOrigin();return true;}catch{return false;}})(),
    configured:getTelephonyProvider(providerName).activationReady,
    assistantConfigured:assistant.configured, assistantManaged:await isPlatformManagedAi(tenantId), assistantNeedsRepair:assistant.needsRepair, paymentsEnabled:false };
}
// Customer request is local only; provider release remains an explicit operator action.
export async function requestNumberRelease(tenantId:string,id:string,userId:string) {
 await transaction(async client=>{
  const number=(await client.query('select id,status from phone_numbers where tenant_id=$1 and id=$2 for update',[tenantId,id])).rows[0];
  if(!number)throw new HttpError(404,'Phone number not found');
  if(number.status==='released')return;
  const updated=await client.query(`update phone_numbers set release_requested_at=now(),release_requested_by=$3,updated_at=now()
    where tenant_id=$1 and id=$2 and release_requested_at is null returning id`,[tenantId,id,userId]);
  if(updated.rows.length)await client.query(`insert into platform_audit_events(actor_id,tenant_id,action,resource_id,reason,reference)
    values($1,$2,'tenant.number.release_requested',$3,'Tester requested operator review; no provider mutation',$4)`,[userId,tenantId,id,`release-request:${id}`]);
 });
}
export async function releaseNumber(tenantId: string, id: string) {
  return withOperationLock(tenantId,async () => {
    const number = await getNumber(tenantId,id);
    const account = number ? await getAccount(tenantId, number.provider) : null;
    if (!number || !account) throw new HttpError(404,'Phone number not found');
    if (number.status==='released') return;
    if (['purchasing','purchase_unknown'].includes(number.provisioning_status)) throw new HttpError(409,'Confirm the reservation before releasing it.');
    // Persist the irreversible-release intent BEFORE DELETE: a process crash
    // after provider acceptance must not allow another paid request.
    await query("update phone_numbers set status='releasing',provisioning_status='release_unknown',updated_at=now() where tenant_id=$1 and id=$2",[tenantId,id]);
    const provider=getTelephonyProvider(account.provider);
    try {
      if(number.provisioning_status!=='release_unknown') {
        await provider.releaseNumber(ref(account),number.e164);
        // A successful standard DELETE starts a paid 24-hour pending_release.
        // The durable intent above prevents a second DELETE even after a crash.
      }
      let stillOwned=false,exhausted=false;
      for(let page=1;page<=100;page++) {
        const owned=await provider.listOwnedNumbers(ref(account),page);
        if(owned.items.some(item=>item.e164===number.e164)){stillOwned=true;break;}
        if(page*100>=owned.total || owned.items.length===0){exhausted=true;break;}
      }
      // Keep the DID unavailable and its hold reserved through cooldown or an
      // ambiguous response. Reconciliation confirms removal without spending.
      if(stillOwned || !exhausted) return;
    } catch {
      await query("update phone_numbers set provisioning_status='release_unknown',updated_at=now() where tenant_id=$1 and id=$2",[tenantId,id]);
      throw new HttpError(503,'Release is being confirmed. Contact support; do not choose another number yet.');
    }
    await transaction(async client => {
      await client.query("update phone_numbers set status='released',provisioning_status='released',released_at=now(),updated_at=now() where tenant_id=$1 and id=$2",[tenantId,id]);
      await client.query("update wallet_holds set status='released',updated_at=now() where tenant_id=$1 and phone_number_id=$2 and status='reserved'",[tenantId,id]);
    });
  });
}
