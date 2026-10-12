import { query } from '@/db/client';
import { transaction } from '@/db/transaction';
import { HttpError } from '@/lib/auth/context';
import { validatedLimits,emitAlpha } from '@/bridge/entitlements.mjs';
export async function alphaAdminSnapshot(page=1) {
 const [tenants,invites,controls,metrics]=await Promise.all([
 query(`select t.id,t.name,t.status,s.plan_code,s.status as subscription_status,s.voice_enabled,s.purchase_enabled,s.phone_activation_approved,
 s.period_start,s.period_end,s.spend_cap_minor,s.entitlement_overrides,p.entitlements,p.display_name,
 coalesce((select sum(amount_minor) from wallet_transactions w where w.tenant_id=t.id),0)::text as balance_minor,
 (select count(*) from alpha_voice_sessions v where v.tenant_id=t.id and state<>'closed' and expires_at>now())::int as active_sessions,
 coalesce((select sum(case when settlement='settled' then used_seconds else reserved_seconds end) from alpha_voice_sessions v where v.tenant_id=t.id and kind='phone' and period_start=s.period_start),0)::text as phone_seconds,
 (select count(*) from telephony_usage_events u where u.tenant_id=t.id and billing_status in('pending','needs_review'))::int as pending_cdr
 from tenants t join tenant_subscriptions s on s.tenant_id=t.id join plans p on p.code=s.plan_code
 order by t.created_at desc limit 25 offset $1`,[(page-1)*25]),
 query('select id,email,max_uses,uses,status,expires_at,created_at from alpha_invites order by created_at desc limit 50'),
 query('select * from platform_usage_controls where id=1'),
 query(`select count(*) filter(where kind='browser' and state='active' and expires_at>now())::int as active_browser,
 count(*) filter(where kind='phone' and state='active' and expires_at>now())::int as active_phone,
 coalesce(sum(used_seconds) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0)::text as today_seconds,
 coalesce(sum(provider_actual_minor),0)::text as provider_actual_minor,
 coalesce(sum(ai_estimated_minor),0)::text as ai_estimated_minor,
 count(*) filter(where kind='phone' and settlement='pending')::int as pending_settlements,
 coalesce(max(extract(epoch from now()-created_at)) filter(where kind='phone' and settlement='pending'),0)::int as oldest_pending_seconds,
 (select coalesce(sum(estimated_minor),0)::text from alpha_ai_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') as request_ai_estimated_minor,
 (select count(*)::int from alpha_ai_usage where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') as today_ai_requests
 from alpha_voice_sessions where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'`)
 ]);
 return {tenants,invites,controls:controls[0],metrics:metrics[0],page};
}
function requiredReason(input:{reason?:unknown;reference?:unknown}) {
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>500 ||
 typeof input.reference!=='string'||!/^[a-zA-Z0-9:_-]{16,100}$/.test(input.reference))throw new HttpError(400,'A reason and unique operation reference are required.');
 return {reason:input.reason.trim(),reference:input.reference};
}
export async function alphaAdminAction(actorId:string,input:{action:string;tenantId?:string;id?:string;reason?:string;reference?:string;amountMinor?:number;value?:unknown;planCode?:string}) {
 const {reason,reference}=requiredReason(input);
 if(input.action==='revoke_invite')return transaction(async c=>{
  if(!input.id||!/^[a-f0-9-]{36}$/i.test(input.id))throw new HttpError(400,'Invalid invitation.');
  const result=await c.query("update alpha_invites set status='revoked' where id=$1 returning id",[input.id]);if(!result.rows.length)throw new HttpError(404,'Invitation not found.');
  await c.query("insert into alpha_operator_events(actor_id,action,resource_id,reason,reference) values($1,'alpha.invite.revoked',$2,$3,$4)",[actorId,input.id,reason,reference]);
 });
 if(input.action==='platform_controls')return transaction(async c=>{
  if(!input.value||typeof input.value!=='object')throw new HttpError(400,'Invalid controls.');
  const value=input.value as Record<string,unknown>;
  const old=(await c.query('select * from platform_usage_controls where id=1 for update')).rows[0];
  const bools=['browser_enabled','phone_enabled','purchase_enabled'],nums=['max_active_sessions','daily_voice_seconds','monthly_voice_seconds','monthly_provider_cap_minor','monthly_ai_cap_minor'];
  for(const key of Object.keys(value))if(![...bools,...nums].includes(key))throw new HttpError(400,'Unknown control.');
  for(const key of bools)if(key in value&&typeof value[key]!=='boolean')throw new HttpError(400,'Invalid gate.');
  for(const key of nums)if(key in value&&(!Number.isSafeInteger(value[key])||Number(value[key])<(key==='max_active_sessions'?1:0)))throw new HttpError(400,'Invalid platform limit.');
  const merged={...old,...value};
  await c.query(`update platform_usage_controls set browser_enabled=$1,phone_enabled=$2,purchase_enabled=$3,
   max_active_sessions=$4,daily_voice_seconds=$5,monthly_voice_seconds=$6,monthly_provider_cap_minor=$7,monthly_ai_cap_minor=$8,updated_at=now() where id=1`,[...bools,...nums].map(k=>merged[k]));
  await c.query("insert into alpha_operator_events(actor_id,action,reason,reference) values($1,'platform.controls.changed',$2,$3)",[actorId,reason,reference]);
 });
 if(!input.tenantId||!/^[a-f0-9-]{36}$/i.test(input.tenantId))throw new HttpError(400,'Invalid workspace.');
 return transaction(async c=>{
  const tid=input.tenantId!;
  const subscription=(await c.query(`select s.*,p.entitlements from tenant_subscriptions s join plans p on p.code=s.plan_code where tenant_id=$1 for update of s`,[tid])).rows[0];
  if(!subscription)throw new HttpError(404,'Workspace not found.');
  switch(input.action) {
   case 'suspend':case 'resume':await c.query('update tenants set status=$2,updated_at=now() where id=$1',[tid,input.action==='suspend'?'suspended':'active']);break;
   case 'phone_approval':if(typeof input.value!=='boolean')throw new HttpError(400,'Invalid phone approval.');
    await c.query('update tenant_subscriptions set phone_activation_approved=$2,updated_at=now() where tenant_id=$1',[tid,input.value]);break;
   case 'voice':case 'purchase':if(typeof input.value!=='boolean')throw new HttpError(400,'Invalid gate.');
    await c.query(`update tenant_subscriptions set ${input.action==='voice'?'voice_enabled':'purchase_enabled'}=$2,updated_at=now() where tenant_id=$1`,[tid,input.value]);break;
   case 'subscription':if(!['active','suspended','cancelled'].includes(String(input.value)))throw new HttpError(400,'Invalid subscription state.');
    await c.query('update tenant_subscriptions set status=$2,updated_at=now() where tenant_id=$1',[tid,input.value]);break;
   case 'plan':if(typeof input.planCode!=='string'||!(await c.query('select 1 from plans where code=$1 and active=true',[input.planCode])).rows.length)throw new HttpError(400,'Invalid plan.');
    await c.query("update tenant_subscriptions set plan_code=$2,entitlement_overrides='{}'::jsonb,updated_at=now() where tenant_id=$1",[tid,input.planCode]);break;
   case 'quota': {
    if(!input.value||typeof input.value!=='object'||Array.isArray(input.value))throw new HttpError(400,'Invalid quota.');
    const overrides=input.value as Record<string,unknown>;
    const permitted=['phone_minutes','browser_seconds','browser_daily_seconds','phone_concurrency','browser_concurrency','max_session_seconds','monthly_spend_minor','monthly_ai_budget_minor','knowledge_items'];
    if(Object.keys(overrides).some(k=>!permitted.includes(k)))throw new HttpError(400,'Unknown quota.');
    const limits=validatedLimits({...subscription.entitlements,...subscription.entitlement_overrides,...overrides});
    void limits;
    await c.query('update tenant_subscriptions set entitlement_overrides=$2::jsonb,updated_at=now() where tenant_id=$1',[tid,JSON.stringify({...subscription.entitlement_overrides,...overrides})]);break;
   }
   case 'credit': {
    const amount=input.amountMinor;if(!Number.isSafeInteger(amount)||amount!<=0||amount!>10000000)throw new HttpError(400,'Invalid credit amount.');
    await c.query('insert into wallet_accounts(tenant_id) values($1) on conflict do nothing',[tid]);
    await c.query('select tenant_id from wallet_accounts where tenant_id=$1 for update',[tid]);
    const key=`alpha-credit:${reference}`,existing=(await c.query('select amount_minor,type from wallet_transactions where tenant_id=$1 and idempotency_key=$2',[tid,key])).rows[0];
    if(existing && (Number(existing.amount_minor)!==amount || existing.type!=='promotional_credit'))throw new HttpError(409,'This credit reference is already used.');
    await c.query(`insert into wallet_transactions(tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key,created_by)
     values($1,'promotional_credit',$2,'operator_promo',$3,$4,$5) on conflict(tenant_id,idempotency_key) do nothing`,[tid,amount,reference,key,actorId]);break;
   }
   default:throw new HttpError(400,'Unsupported operator action.');
  }
  await c.query(`insert into platform_audit_events(actor_id,tenant_id,action,reason,reference)
  values($1,$2,$3,$4,$5)`,[actorId,tid,`alpha.${input.action}`,reason,reference]);
  emitAlpha(input.action==='credit'?'wallet.promo_credit.granted':`alpha.tenant.${input.action}`,tid);
 });
}
