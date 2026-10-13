import { HttpError, requireUserId } from '@/lib/auth/context';
import { query,queryOne } from '@/db/client';
import { transaction } from '@/db/transaction';
import { getAccount,getNumber,wallet,initWallet,withOperationLock } from './store';
import { getTelephonyProvider } from './provider';
import { reconcileVoiceLinkCheckout,reconcileVoiceLinkAccount,closeVoiceLinkDraft } from './providers/voicelink/recovery';
import { isPhoneProvider } from './provider-options';
import { syncKyc,retryNumber } from './service';
import { assertActivationAllowed,operationKey } from './policy';

export async function requirePlatformAdmin(request: Request) {
  const user=await requireUserId(request);
  const allowed=(process.env.PLATFORM_ADMIN_USER_IDS??'').split(',').map(v=>v.trim()).filter(Boolean);
  if(!allowed.includes(user.id)) throw new HttpError(403,'Administrator access required');
  return user;
}
export async function adminSnapshot(page=1) {
  return query(`with selected_tenants as (select * from tenants order by created_at desc limit 25 offset $1)
    select t.id,t.name,t.status,coalesce(a.provider,'vobiz') as provider,a.provider_username,a.provider_auth_id,a.kyc_status,a.kyc_calls_blocked,a.status as account_status,a.error_code as account_error,
    n.id as number_id,n.e164,n.status as number_status,n.provisioning_status,n.error_code,n.release_requested_at,
    coalesce((select sum(amount_minor) from wallet_transactions w where w.tenant_id=t.id),0)::text as balance_minor,
    (select count(*) from telephony_usage_events u where u.tenant_id=t.id and u.provider=coalesce(a.provider,'vobiz') and u.billing_status='pending') as pending_calls,
    (select count(*) from telephony_usage_events u where u.tenant_id=t.id and u.provider=coalesce(a.provider,'vobiz') and u.call_status='failed') as failed_calls,
    coalesce((select jsonb_agg(recent) from (select provider_call_id,call_status,billing_status,duration_seconds,updated_at from telephony_usage_events u where u.tenant_id=t.id and u.provider=coalesce(a.provider,'vobiz') order by u.updated_at desc limit 5) recent),'[]'::jsonb) as recent_usage
    ,(select jsonb_build_object('id',c.id,'state',c.state,'e164',c.e164,'code',c.recovery_code,'checkedAt',c.recovery_checked_at,'orderId',c.provider_order_id)
      from voicelink_checkouts c where c.tenant_id=t.id and a.provider='voicelink' and c.state<>'expired' limit 1) as checkout
    from selected_tenants t left join tenant_telephony_accounts a on a.tenant_id=t.id
    left join phone_numbers n on n.tenant_id=t.id and n.telephony_account_id=a.id and n.status<>'released'
    order by t.created_at desc,a.provider`,[(page-1)*25]);
}
export async function adminAction(actorId:string,input:{tenantId:string;action:string;provider?:string;numberId?:string;amountMinor?:number;reference?:string;providerDraftClosed?:boolean;reason?:string}) {
  const provider=input.provider??'vobiz';
  if(!isPhoneProvider(provider))throw new HttpError(400,'Unknown phone provider');
  if(input.reference!==undefined && (typeof input.reference!=='string'||input.reference.length>100))throw new HttpError(400,'Invalid operator reference');
  if(!input.reason?.trim() || input.reason.length>500)throw new HttpError(400,'An operator reason is required');
  const tenant=await queryOne('select id from tenants where id=$1',[input.tenantId]);
  if(!tenant) throw new HttpError(404,'Workspace not found');
  await query('insert into platform_audit_events(actor_id,tenant_id,action,resource_id,reason,reference) values($1,$2,$3,$4,$5,$6)',
    [actorId,input.tenantId,`${input.action}.requested`,input.numberId??null,input.reason.trim(),input.reference??null]);
  if(input.action==='sync_kyc') await syncKyc(input.tenantId,provider);
  else if(input.action==='reconcile_voicelink_checkout' && provider==='voicelink') await reconcileVoiceLinkCheckout(input.tenantId);
  else if(input.action==='reconcile_voicelink_account' && provider==='voicelink') await reconcileVoiceLinkAccount(input.tenantId);
  else if(input.action==='close_voicelink_draft' && provider==='voicelink') await closeVoiceLinkDraft(input.tenantId,input.reference,input.providerDraftClosed);
  else if(input.action==='retry_number' && input.numberId) await retryNumber(input.tenantId,input.numberId);
  else if(input.action==='suspend_number' && input.numberId) {
    await withOperationLock(input.tenantId,async()=>{
      if(!await getNumber(input.tenantId,input.numberId!)) throw new HttpError(404,'Number not found');
      await query("update phone_numbers set status='suspended',updated_at=now() where tenant_id=$1 and id=$2 and status='active'",[input.tenantId,input.numberId]);
    });
  } else if(input.action==='resume_number' && input.numberId) {
    const number=await getNumber(input.tenantId,input.numberId);
    if(!number) throw new HttpError(404,'Number not found');
    if(!getTelephonyProvider(number.provider).activationReady) throw new HttpError(503,'Phone activation is awaiting provider readiness checks.');
    await syncKyc(input.tenantId,number.provider);assertActivationAllowed(await getAccount(input.tenantId,number.provider));
    const balance=await wallet(input.tenantId);
    if(balance.availableMinor<=0 || balance.status!=='active') throw new HttpError(402,'Positive balance is required');
    if(number.provisioning_status!=='active') throw new HttpError(409,'Routing has not been verified');
    const updated=await query("update phone_numbers set status='active',updated_at=now() where tenant_id=$1 and id=$2 and status='suspended' and next_rental_at>now() returning id",[input.tenantId,input.numberId]);
    if(!updated.length) throw new HttpError(409,'Rental must be reconciled before resuming');
  } else if(input.action==='credit') {
    if(!Number.isSafeInteger(input.amountMinor) || input.amountMinor!<=0 || input.amountMinor!>10000000) throw new HttpError(400,'Invalid credit amount');
    const key=operationKey(input.reference);
    await initWallet(input.tenantId);
    await transaction(async client=>{
      await client.query('select tenant_id from wallet_accounts where tenant_id=$1 for update',[input.tenantId]);
      const existing=await client.query('select amount_minor from wallet_transactions where tenant_id=$1 and idempotency_key=$2',[input.tenantId,`admin-credit:${key}`]);
      if(existing.rows[0] && Number(existing.rows[0].amount_minor)!==input.amountMinor) throw new HttpError(409,'Credit reference already used for another amount');
      await client.query(`insert into wallet_transactions(tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key,created_by)
        values($1,'promotional_credit',$2,'beta_credit',$3,$4,$5) on conflict(tenant_id,idempotency_key) do nothing`,[input.tenantId,input.amountMinor,key,`admin-credit:${key}`,actorId]);
    });
  } else throw new HttpError(400,'Invalid administrator action');
  await query('insert into platform_audit_events(actor_id,tenant_id,action,resource_id,reason,reference) values($1,$2,$3,$4,$5,$6)',[actorId,input.tenantId,`${input.action}.completed`,input.numberId??null,input.reason.trim(),input.reference??null]);
}
