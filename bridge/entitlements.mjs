// Shared DB authority. Callers supply the existing app/bridge transaction driver.
import {createHash} from 'node:crypto';
import {AlphaAccessError} from './alpha-policy.mjs';
export const hashSessionToken = value => createHash('sha256').update(value).digest('hex');
export const emitAlpha = (event,tenantId,reason,sessionId) => console.info(JSON.stringify({event,tenantId,reason,sessionId}));
const deny = reason => ({allowed:false,reason});
export function validatedLimits(value) {
 const fields=['phone_concurrency','browser_concurrency','max_session_seconds','phone_minutes','browser_seconds','browser_daily_seconds','monthly_spend_minor','monthly_ai_budget_minor','ai_reserve_minor','knowledge_items'];
 for(const field of fields)if(!Number.isSafeInteger(value?.[field]) || value[field]<0)throw new AlphaAccessError(503,'Plan limits are invalid.');
 if(value.max_session_seconds<1 || value.max_session_seconds>900)throw new AlphaAccessError(503,'Plan session duration must be between 1 and 900 seconds.');
 return value;
}
export async function loadEntitlement(client,tenantId,lock=true) {
 // Calendar UTC periods roll independently of wallet credit; historical snapshots remain.
 if(lock) await client.query(`update tenant_subscriptions set
 period_start=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',
 period_end=(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC',updated_at=now()
 where tenant_id=$1 and status='active' and period_end<=now()`,[tenantId]);
 const result=await client.query(`select s.*,p.display_name,p.active as plan_active,p.version,p.entitlements,t.status as tenant_status
 from tenant_subscriptions s join plans p on p.code=s.plan_code join tenants t on t.id=s.tenant_id
 where s.tenant_id=$1 ${lock?'for update of s':''}`,[tenantId]);
 const row=result.rows[0];if(!row)return null;
 row.limits=validatedLimits({...row.entitlements,...(row.entitlement_overrides??{})});return row;
}
function capabilityDecision(row,capability,controls) {
 if(!row || row.tenant_status!=='active')return deny('This workspace is suspended. Contact your organiser.');
 if(!row.plan_active || row.status!=='active')return deny('Your plan is inactive. Contact your organiser.');
 if(row.limits[capability]!==true)return deny('This feature is not included in your plan.');
 if(['browser_voice','phone_inbound','phone_outbound'].includes(capability) && !row.voice_enabled)return deny('Voice is disabled for this workspace.');
 if(capability==='number_purchase' && (!row.purchase_enabled || !controls.purchase_enabled))return deny('Number activation is paused.');
 if(capability==='browser_voice' && (!controls.browser_enabled || process.env.PLATFORM_BROWSER_VOICE_ENABLED==='0'))return deny('Browser voice is paused.');
 if(capability.startsWith('phone_') && (!controls.phone_enabled || process.env.PLATFORM_NEW_PHONE_CALLS_ENABLED==='0' || process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED!=='1'))return deny('Phone service is awaiting provider readiness.');
 if(capability==='number_purchase' && (process.env.PLATFORM_NUMBER_PURCHASE_ENABLED==='0' || process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED!=='1'))return deny('Number activation is awaiting provider readiness.');
 return {allowed:true,reason:null,limits:row.limits,planCode:row.plan_code,periodStart:row.period_start,periodEnd:row.period_end};
}
export async function authorizeUsage(tenantId,capability,transaction) {
 return transaction(async c=>{
  const control=(await c.query('select * from platform_usage_controls where id=1')).rows[0];
  if(!control)throw new AlphaAccessError(503,'Platform limits are unavailable.');
  const decision=capabilityDecision(await loadEntitlement(c,tenantId),capability,control);
  if(!decision.allowed)emitAlpha('tenant.entitlement.denied',tenantId,decision.reason);return decision;
 });
}
const effectiveSeconds = "case when settlement='settled' then used_seconds else reserved_seconds end";
export async function usageTotals(c,tenantId,periodStart) {
 return (await c.query(`select
 coalesce(sum(${effectiveSeconds}) filter(where kind='phone'),0)::bigint as phone_seconds,
 coalesce(sum(${effectiveSeconds}) filter(where kind<>'phone'),0)::bigint as browser_seconds,
 coalesce(sum(${effectiveSeconds}) filter(where kind<>'phone' and created_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')),0)::bigint as browser_daily_seconds,
 coalesce(sum(ai_estimated_minor),0)::bigint as ai_minor
 from alpha_voice_sessions where tenant_id=$1 and period_start=$2`,[tenantId,periodStart])).rows[0];
}
async function expireBrowserReservations(c,tenantId) {
 // Unclaimed tokens cost zero. A crashed running bridge consumes its full allowance;
 // expiration never grants free unaccounted AI usage.
 await c.query(`update alpha_voice_sessions set state='closed',settlement='settled',
 used_seconds=case when state='authorized' then 0 else reserved_seconds end,
 ended_at=now(),end_reason='lease_expired' where ($1::uuid is null or tenant_id=$1) and kind<>'phone'
 and state<>'closed' and ((state='authorized' and token_expires_at<=now()) or expires_at<=now())`,[tenantId]);
}
export async function admitVoiceSession(c,input) {
 const {tenantId,kind,userId=null,providerCallId=null,phoneNumberId=null,rateMinor=0}=input;
 const reject=(status,message)=>{emitAlpha(kind==='phone'?'phone.call.denied':'gemini.session.denied',tenantId,message);return new AlphaAccessError(status,message);};
 if(!['browser','phone','legacy'].includes(kind))throw reject(400,'Unknown voice channel.');
 const control=(await c.query('select * from platform_usage_controls where id=1 for update')).rows[0];
 const row=await loadEntitlement(c,tenantId);
 const decision=capabilityDecision(row,kind==='phone'?'phone_inbound':'browser_voice',control);
 if(kind==='legacy' && (row?.plan_code!=='internal' || !control.phone_enabled || process.env.PLATFORM_NEW_PHONE_CALLS_ENABLED==='0'))throw reject(403,'Legacy phone is unavailable for this workspace.');
 if(!decision.allowed){emitAlpha('tenant.quota.denied',tenantId,decision.reason);throw reject(403,decision.reason);}
 if(userId && !(await c.query('select 1 from tenant_memberships where tenant_id=$1 and user_id=$2',[tenantId,userId])).rows.length)throw reject(403,'Workspace access revoked.');
 await expireBrowserReservations(c,null);
 const active=(await c.query(`select count(*)::int as count from alpha_voice_sessions where tenant_id=$1
 and kind=$2 and state<>'closed' and expires_at>now()`,[tenantId,kind])).rows[0].count;
 const max=kind==='phone'?row.limits.phone_concurrency:row.limits.browser_concurrency;
 if(active>=max)throw reject(429,'Another voice session is active. End it before starting another.');
 const totals=await usageTotals(c,tenantId,row.period_start),limits=row.limits;
 let seconds=Math.min(limits.max_session_seconds,kind==='phone'?limits.phone_minutes*60-Number(totals.phone_seconds):
 Math.min(limits.browser_seconds-Number(totals.browser_seconds),limits.browser_daily_seconds-Number(totals.browser_daily_seconds)));
 const aiSpent=(await c.query('select coalesce(sum(estimated_minor),0) as total from alpha_ai_usage where tenant_id=$1 and period_start=$2',[tenantId,row.period_start])).rows[0].total;
 const aiRate=Number(process.env.AI_VOICE_ESTIMATE_MINOR_PER_MINUTE ?? '100');
 if(!Number.isSafeInteger(aiRate)||aiRate<=0)throw reject(503,'AI estimate rate is invalid.');
 seconds=Math.min(seconds,Math.floor((limits.monthly_ai_budget_minor-Number(totals.ai_minor)-Number(aiSpent))/aiRate)*60);
 let walletAvailable=0,reservedMinor=0;
 if(kind==='phone') {
  if(!Number.isSafeInteger(rateMinor)||rateMinor<1)throw reject(503,'Phone pricing is unavailable.');
  const wallet=(await c.query('select status from wallet_accounts where tenant_id=$1 for update',[tenantId])).rows[0];
  if(wallet?.status!=='active')throw reject(402,'Phone credit is unavailable. Contact your organiser.');
  walletAvailable=Number((await c.query(`select coalesce((select sum(amount_minor) from wallet_transactions where tenant_id=$1),0)
  -coalesce((select sum(amount_minor) from wallet_holds where tenant_id=$1 and status='reserved'),0)
  -coalesce((select sum(reserved_minor) from telephony_usage_events where tenant_id=$1 and billing_status='pending'),0) as available`,[tenantId])).rows[0].available);
  const spent=await tenantSpend(c,tenantId,row.period_start,row.period_end);
  const cap=Math.min(limits.monthly_spend_minor,row.spend_cap_minor===null?Infinity:Number(row.spend_cap_minor));
  seconds=Math.min(seconds,Math.floor(Math.min(walletAvailable,cap-spent)/rateMinor)*60);
 }
 // Rounded-minute reservation includes termination buffer; no automatic overage.
 seconds=kind==='phone'?Math.floor(seconds/60)*60:Math.floor(seconds);
 if(seconds<(kind==='phone'?60:1))throw reject(402,'Your voice allowance or credit is used. Contact your organiser.');
 reservedMinor=kind==='phone'?Math.ceil(seconds/60)*rateMinor:0;
 const providerRate=Number(process.env.PROVIDER_VOICE_RESERVE_MINOR_PER_MINUTE ?? '0');
 if(kind==='phone' && (!Number.isSafeInteger(providerRate)||providerRate<1))throw reject(503,'Provider exposure pricing must be configured.');
 const providerReserve=kind==='phone'?Math.ceil(seconds/60)*providerRate:0;
 const aiReserve=Math.ceil(seconds/60)*aiRate;
 const global=(await c.query(`select count(*) filter(where state<>'closed' and expires_at>now())::int as active,
 coalesce(sum(${effectiveSeconds}),0) as monthly_seconds,
 coalesce(sum(${effectiveSeconds}) filter(where created_at>=(date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')),0) as daily_seconds,
 coalesce(sum(coalesce(provider_actual_minor,provider_reserved_minor)),0) as provider_minor,
 coalesce(sum(ai_estimated_minor),0) as ai_minor
 from alpha_voice_sessions where created_at>=(date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')`)).rows[0];
 const globalAi=Number((await c.query("select coalesce(sum(estimated_minor),0) as total from alpha_ai_usage where created_at>=(date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')")).rows[0].total);
 if(global.active>=control.max_active_sessions || Number(global.monthly_seconds)+seconds>control.monthly_voice_seconds ||
 Number(global.daily_seconds)+seconds>control.daily_voice_seconds || Number(global.provider_minor)+providerReserve>Number(control.monthly_provider_cap_minor) ||
 Number(global.ai_minor)+globalAi+aiReserve>Number(control.monthly_ai_cap_minor))throw reject(429,'Platform testing allowance is used. Contact your organiser.');
 const result=await c.query(`insert into alpha_voice_sessions(tenant_id,user_id,kind,provider_call_id,phone_number_id,
 token_expires_at,expires_at,reserved_seconds,reserved_minor,provider_reserved_minor,ai_estimated_minor,
 plan_code,plan_version,pricing_version,period_start,period_end,limits_snapshot)
 values($1,$2,$3,$4,$5,now()+interval '90 seconds',now()+$6*interval '1 second',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb) returning *`,
 [tenantId,userId,kind,providerCallId,phoneNumberId,kind==='phone'?seconds-30:seconds,seconds,reservedMinor,providerReserve,aiReserve,
 row.plan_code,row.version,process.env.PRICING_VERSION??'alpha-v1',row.period_start,row.period_end,JSON.stringify(limits)]);
 emitAlpha('gemini.session.authorized',tenantId,undefined,result.rows[0].id);
 return {...result.rows[0],maxDurationMs:(kind==='phone'?seconds-30:seconds)*1000};
}
export async function claimVoiceSession(claims,transaction) {
 if(typeof claims.session_id!=='string'||typeof claims.nonce!=='string')return null;
 return transaction(async c=>{
  const row=await loadEntitlement(c,claims.tid);
  const control=(await c.query('select * from platform_usage_controls where id=1')).rows[0];
  const result=await c.query(`select * from alpha_voice_sessions where tenant_id=$1 and id=$2
   and state='authorized' and token_expires_at>now() and expires_at>now() for update`,[claims.tid,claims.session_id]);
  const session=result.rows[0];if(!session)return null;
  const decision=capabilityDecision(row,session.kind==='phone'?'phone_inbound':'browser_voice',control);
  if(!decision.allowed)return null;
  if(session.kind==='browser' && (session.user_id!==claims.sub || !(await c.query('select 1 from tenant_memberships where tenant_id=$1 and user_id=$2',[claims.tid,claims.sub])).rows.length))return null;
  if(session.kind==='phone' && (session.phone_number_id!==claims.phone_number_id || session.provider_call_id!==claims.provider_call_id))return null;
  const hash=hashSessionToken(claims.nonce);
  if(session.token_hash && session.token_hash!==hash)return null;
  await c.query("update alpha_voice_sessions set state='active',token_hash=$3,started_at=now() where tenant_id=$1 and id=$2",[claims.tid,session.id,hash]);
  emitAlpha('gemini.session.started',claims.tid,undefined,session.id);
  return session;
 });
}
export async function finishVoiceSession(tenantId,sessionId,transaction,reason='disconnected') {
 return transaction(async c=>{
  await loadEntitlement(c,tenantId);
  const row=(await c.query('select * from alpha_voice_sessions where tenant_id=$1 and id=$2 for update',[tenantId,sessionId])).rows[0];
  if(!row || row.state==='closed')return;
  const elapsed=row.started_at?Math.max(0,Math.min(row.reserved_seconds,Math.ceil((Date.now()-new Date(row.started_at).getTime())/1000))):0;
  await c.query(`update alpha_voice_sessions set state='closed',ended_at=now(),end_reason=$3,
  used_seconds=case when kind='phone' then used_seconds else $4 end,
  settlement=case when kind='phone' then settlement else 'settled' end where tenant_id=$1 and id=$2`,[tenantId,sessionId,reason,elapsed]);
  emitAlpha('gemini.session.ended',tenantId,reason,sessionId);
 });
}
export async function tenantSpend(c,tenantId,start,end) {
 return Number((await c.query(`select
 coalesce((select sum(-amount_minor) from wallet_transactions where tenant_id=$1 and amount_minor<0 and created_at>=$2 and created_at<$3),0)+
 coalesce((select sum(amount_minor) from wallet_holds where tenant_id=$1 and status='reserved'),0)+
 coalesce((select sum(reserved_minor) from telephony_usage_events where tenant_id=$1 and billing_status='pending'),0) as spent`,[tenantId,start,end])).rows[0].spent);
}
export async function recordVoiceTokens(tenantId,sessionId,tokens,transaction) {
 if(!Number.isSafeInteger(tokens)||tokens<0)return;
 await transaction(c=>c.query('update alpha_voice_sessions set ai_tokens=greatest(coalesce(ai_tokens,0),$3) where tenant_id=$1 and id=$2',[tenantId,sessionId,tokens]));
}
export async function rollingVoiceAuthorization(tenantId,sessionId,transaction) {
 return transaction(async c=>{
  const row=await loadEntitlement(c,tenantId),control=(await c.query('select * from platform_usage_controls where id=1')).rows[0];
  const session=(await c.query('select * from alpha_voice_sessions where tenant_id=$1 and id=$2',[tenantId,sessionId])).rows[0];
  if(!session || session.state!=='active' || new Date(session.expires_at).getTime()<=Date.now())return deny('Session time limit reached.');
  const decision=capabilityDecision(row,session.kind==='phone'?'phone_inbound':'browser_voice',control);
  if(!decision.allowed)return decision;
  if(session.kind==='legacy' && (row.plan_code!=='internal' || !control.phone_enabled || process.env.PLATFORM_NEW_PHONE_CALLS_ENABLED==='0'))return deny('Legacy phone is paused.');
  const global=(await c.query(`select count(*) filter(where state<>'closed' and expires_at>now())::int as active,coalesce(sum(case when settlement='settled' then used_seconds else reserved_seconds end),0) as seconds,coalesce(sum(case when settlement='settled' then used_seconds else reserved_seconds end) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0) as daily_seconds,coalesce(sum(coalesce(provider_actual_minor,provider_reserved_minor)),0) as provider,coalesce(sum(ai_estimated_minor),0) as ai from alpha_voice_sessions where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'`)).rows[0];
  const requestAi=Number((await c.query(`select coalesce(sum(estimated_minor),0) as total from alpha_ai_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'`)).rows[0].total);
  if(global.active>control.max_active_sessions || Number(global.seconds)>Number(control.monthly_voice_seconds) || Number(global.daily_seconds)>Number(control.daily_voice_seconds) || Number(global.provider)>Number(control.monthly_provider_cap_minor)||Number(global.ai)+requestAi>Number(control.monthly_ai_cap_minor))return deny('Platform testing budget changed.');
  if(session.user_id && !(await c.query('select 1 from tenant_memberships where tenant_id=$1 and user_id=$2',[tenantId,session.user_id])).rows.length)return deny('Workspace access revoked.');
  const total=await usageTotals(c,tenantId,session.period_start);
  const requests=Number((await c.query('select coalesce(sum(estimated_minor),0) as amount from alpha_ai_usage where tenant_id=$1 and period_start=$2',[tenantId,session.period_start])).rows[0].amount);
  const active=Number((await c.query("select count(*) as amount from alpha_voice_sessions where tenant_id=$1 and kind=$2 and state<>'closed' and expires_at>now()",[tenantId,session.kind])).rows[0].amount);
  if(active>(session.kind==='phone'?row.limits.phone_concurrency:row.limits.browser_concurrency))return deny('Concurrency allowance changed.');
  if(Number(total.phone_seconds)>row.limits.phone_minutes*60 || Number(total.browser_seconds)>row.limits.browser_seconds || Number(total.ai_minor)+requests>row.limits.monthly_ai_budget_minor)return deny('Voice allowance changed. Contact your organiser.');
  if(session.kind==='phone') {
   if(await tenantSpend(c,tenantId,row.period_start,row.period_end)>Math.min(row.limits.monthly_spend_minor,row.spend_cap_minor===null?Infinity:Number(row.spend_cap_minor)))return deny('Workspace spending limit changed.');
   const allowed=(await c.query(`select 1 from wallet_accounts w join phone_numbers n on n.tenant_id=w.tenant_id
   join tenant_telephony_accounts a on a.tenant_id=n.tenant_id and a.id=n.telephony_account_id
   where w.tenant_id=$1 and n.id=$2 and w.status='active' and n.status='active'
   and a.status='active' and a.kyc_calls_blocked=false and
   coalesce((select sum(amount_minor) from wallet_transactions where tenant_id=$1),0)>=
   coalesce((select sum(amount_minor) from wallet_holds where tenant_id=$1 and status='reserved'),0)+
   coalesce((select sum(reserved_minor) from telephony_usage_events where tenant_id=$1 and billing_status='pending'),0)`,[tenantId,session.phone_number_id])).rows;
   if(!allowed.length)return deny('Phone authorization or reserved credit is unavailable.');
  }
  return {allowed:true,reason:null};
 });
}
export async function reserveAiRequest(tenantId,operation,transaction) {
 return transaction(async c=>{
  const control=(await c.query('select * from platform_usage_controls where id=1 for update')).rows[0];
  const row=await loadEntitlement(c,tenantId);
  const decision=capabilityDecision(row,'knowledge_upload',control);
  if(!decision.allowed)throw new AlphaAccessError(403,decision.reason);
  const total=await usageTotals(c,tenantId,row.period_start);
  const spent=Number((await c.query('select coalesce(sum(estimated_minor),0) as total from alpha_ai_usage where tenant_id=$1 and period_start=$2',[tenantId,row.period_start])).rows[0].total);
  const global=Number((await c.query(`select coalesce(sum(estimated_minor),0) as total from alpha_ai_usage where created_at>=(date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')`)).rows[0].total)+Number((await c.query("select coalesce(sum(ai_estimated_minor),0) as total from alpha_voice_sessions where created_at>=(date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')")).rows[0].total);
  const estimate=row.limits.ai_reserve_minor;
  if(estimate<1 || spent+Number(total.ai_minor)+estimate>row.limits.monthly_ai_budget_minor || global+estimate>Number(control.monthly_ai_cap_minor))throw new AlphaAccessError(429,'AI testing allowance is used. Contact your organiser.');
  const result=await c.query(`insert into alpha_ai_usage(tenant_id,operation,estimated_minor,plan_code,plan_version,period_start)
  values($1,$2,$3,$4,$5,$6) returning id`,[tenantId,operation,estimate,row.plan_code,row.version,row.period_start]);return result.rows[0].id;
 });
}
