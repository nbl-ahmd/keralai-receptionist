import { admitVoiceSession } from '@/bridge/entitlements.mjs';
import { requireCapability } from '@/lib/alpha/entitlements';
import { settlePhoneSession } from '@/bridge/alpha-billing.mjs';
import { query, queryOne } from '@/db/client';
import { transaction } from '@/db/transaction';
import { getTenantSecretValue } from '@/lib/tenant/secrets';
import { getTenantGeminiApiKey } from '@/lib/gemini';
import { createPhoneBridgeToken } from '@/lib/tenant/bridge-token';
import { getTelephonyProvider } from './provider';
import { normalizeE164, publicOrigin, price, callCharge, assertActivationAllowed } from './policy';
import { getAccount, wallet, requireActiveTenant, observe } from './store';
import { syncKyc } from './service';
import { eventHash } from './providers/vobiz/webhooks';
import { streamXml } from './providers/vobiz/xml';
import type { PhoneNumberRow } from './types';
import { HttpError } from '@/lib/auth/context';

export async function parseVoiceRequest(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) throw new HttpError(400,'Invalid callback');
  const body = await request.text();
  if (body.length > 16384) throw new HttpError(413,'Invalid callback');
  const form = new URLSearchParams(body);
  const id = form.get('CallUUID');
  if (!id || !/^[a-zA-Z0-9-]{8,100}$/.test(id)) throw new HttpError(400,'Invalid callback');
  return { id, from:normalizeE164(form.get('From')),to:normalizeE164(form.get('To')),body,form };
}
export async function verifyVoiceRequest(request: Request, parsed: Awaited<ReturnType<typeof parseVoiceRequest>>) {
  // Trusted provider number registry is the only way to select tenant context.
  const number = await queryOne<PhoneNumberRow>("select * from phone_numbers where e164=$1 and provider='vobiz' and status <> 'released'",[parsed.to]);
  if (!number) throw new HttpError(403,'Invalid callback');
  const account = await getAccount(number.tenant_id,'vobiz');
  if (!account?.provider_auth_id) throw new HttpError(403,'Invalid callback');
  const token = await getTenantSecretValue(number.tenant_id,'vobiz','auth_token');
  const nonce = getTelephonyProvider('vobiz').verifyVoiceWebhook({ headers:request.headers,
    url:publicOrigin()+new URL(request.url).pathname,token:token ?? undefined });
  if (!nonce) throw new HttpError(403,'Invalid callback');
  return { number,account,nonce,ref:{tenantId:number.tenant_id,authId:account.provider_auth_id} };
}
export async function answerCall(request: Request) {
  if (!getTelephonyProvider('vobiz').activationReady) throw new HttpError(503,'Unavailable');
  const parsed = await parseVoiceRequest(request);
  const { number,account,nonce,ref } = await verifyVoiceRequest(request,parsed);
  await requireCapability(number.tenant_id,'phone_inbound');
  if (number.status !== 'active') throw new HttpError(403,'Unavailable');
  // Independent gate and metadata reads run together to keep answer latency low.
  const [balance,live,assistantKey] = await Promise.all([
    wallet(number.tenant_id),getTelephonyProvider(account.provider).getCall(ref,parsed.id),getTenantGeminiApiKey(number.tenant_id),
    requireActiveTenant(number.tenant_id),syncKyc(number.tenant_id),
  ]);
  assertActivationAllowed(await getAccount(number.tenant_id));
  if (!assistantKey || balance.status !== 'active' || balance.availableMinor < price('CALL_PRICE_PER_MINUTE_MINOR')) throw new HttpError(403,'Unavailable');
  // Voice signatures cover URL+nonce, not body. Verify actual tenant live metadata.
  if (live.direction !== 'inbound' || live.from !== parsed.from || live.to !== parsed.to) throw new HttpError(403,'Invalid callback');
  const nonceKey = eventHash(`voice:answer:${nonce}`);
  const owned = await transaction(async client => {
    const session=await admitVoiceSession(client,{tenantId:number.tenant_id,kind:'phone',providerCallId:parsed.id,
      phoneNumberId:number.id,rateMinor:price('CALL_PRICE_PER_MINUTE_MINOR')});
    const claimed=await client.query(`insert into telephony_nonces (nonce_hash,tenant_id,expires_at)
      values ($1,$2,now()+interval '7 days') on conflict do nothing returning nonce_hash`,[nonceKey,number.tenant_id]);
    if (!claimed.rows.length) throw new HttpError(403,'Invalid callback');
    await client.query(`insert into telephony_usage_events (tenant_id,phone_number_id,provider,provider_call_id,direction,from_number,to_number,idempotency_key,rate_per_minute_minor,reserved_minor,alpha_session_id)
      values ($1,$2,'vobiz',$3,'inbound',$4,$5,$6,$7,$8,$9) on conflict (provider,provider_call_id) do nothing`,
      [number.tenant_id,number.id,parsed.id,live.from,live.to,`vobiz:${parsed.id}`,price('CALL_PRICE_PER_MINUTE_MINOR'),session.reserved_minor,session.id]);
    const result=await client.query('select id from telephony_usage_events where tenant_id=$1 and phone_number_id=$2 and provider_call_id=$3 and ended_at is null',
      [number.tenant_id,number.id,parsed.id]);
    if (!result.rows[0]) throw new HttpError(403,'Invalid callback');
    await client.query(`insert into calls (tenant_id,call_sid,caller,phone,channel,started_at,outcome)
      values ($1,$2,'Unknown caller',$3,'phone',now(),'answered') on conflict (tenant_id,call_sid) do nothing`,
      [number.tenant_id,`vobiz:${parsed.id}`,live.from]);
    return {id:result.rows[0].id as string,sessionId:session.id as string};
  });
  const base = new URL(process.env.BRIDGE_PUBLIC_URL ?? '');
  if (!['https:','wss:'].includes(base.protocol) || base.username || base.password) throw new HttpError(503,'Unavailable');
  base.protocol='wss:'; base.pathname='/ws/vobiz'; base.search=''; base.hash='';
  base.searchParams.set('token',createPhoneBridgeToken({ tenantId:number.tenant_id,phoneNumberId:number.id,providerCallId:parsed.id,sessionId:owned.sessionId }));
  observe('vobiz.call.inbound',number.tenant_id,owned.id);
  return streamXml(base.href);
}
export async function reconcileCall(tenantId: string, callId: string) {
  const usage = await queryOne<{ id:string; phone_number_id:string; from_number:string; to_number:string; billing_status:string }>(
    "select * from telephony_usage_events where tenant_id=$1 and provider='vobiz' and provider_call_id=$2",[tenantId,callId]);
  if (!usage) throw new HttpError(404,'Call not found');
  if (usage.billing_status==='charged') return;
  const account = await getAccount(tenantId);
  if (!account?.provider_auth_id) throw new HttpError(409,'Call requires review');
  const call = await getTelephonyProvider().getCall({tenantId,authId:account.provider_auth_id},callId,true);
  if (call.direction!=='inbound' || call.from!==usage.from_number || call.to!==usage.to_number || call.currency!=='INR')
    throw new HttpError(409,'Call requires review');
  await transaction(async client => {
    await client.query('select tenant_id from wallet_accounts where tenant_id=$1 for update',[tenantId]);
    const row = await client.query('select * from telephony_usage_events where tenant_id=$1 and id=$2 for update',[tenantId,usage.id]);
    if (row.rows[0].billing_status==='charged') return;
    const charge = callCharge(call.billableSeconds!,Number(row.rows[0].rate_per_minute_minor));
    await settlePhoneSession(client,tenantId,callId,{billableSeconds:call.billableSeconds!,providerCost:call.cost!,customerChargeMinor:charge});
    if (charge>0) await client.query(`insert into wallet_transactions (tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key)
      values ($1,'call_usage',$2,'usage',$3,$4) on conflict (tenant_id,idempotency_key) do nothing`,[tenantId,-charge,usage.id,`call:vobiz:${callId}`]);
    await client.query(`update calls set ended_at=$3,duration_sec=$4,outcome=case when $5::timestamptz is null then 'missed' else outcome end where tenant_id=$1 and call_sid=$2`,[tenantId,`vobiz:${callId}`,call.endedAt,call.durationSeconds,call.answeredAt??null]);
    await client.query(`update telephony_usage_events set started_at=$3,answered_at=$4,ended_at=$5,duration_seconds=$6,
      billable_seconds=$7,provider_cost=$8,customer_charge_minor=$9,billing_status='charged',call_status=case when call_status='failed' then call_status else $10 end,updated_at=now()
      where tenant_id=$1 and id=$2`,[tenantId,usage.id,call.startedAt,call.answeredAt ?? null,call.endedAt,call.durationSeconds,call.billableSeconds,call.cost,charge,call.status]);
  });
  observe('vobiz.call.completed',tenantId,usage.id);
}
export async function callWebhook(request: Request) {
  const parsed = await parseVoiceRequest(request);
  const verified = await verifyVoiceRequest(request,parsed);
  const tenantId=verified.number.tenant_id;
  if (parsed.form.get('Event')!=='Hangup') throw new HttpError(400,'Invalid callback');
  // Bind nonce to body digest to stop reuse of a signed URL+nonce with altered data.
  const key=eventHash(`calls:${verified.nonce}`), digest=eventHash(parsed.body);
  await query(`insert into telephony_webhook_events (provider,event_key,tenant_id,event_type)
    values ('vobiz',$1,$2,$3) on conflict do nothing`,[key,tenantId,`Hangup:${digest}`]);
  const event=await queryOne<{status:string;event_type:string}>('select status,event_type from telephony_webhook_events where provider=$1 and event_key=$2 and tenant_id=$3',['vobiz',key,tenantId]);
  if (!event || event.event_type!==`Hangup:${digest}`) throw new HttpError(403,'Invalid callback');
  if (event.status==='processed') return;
  try {
    await reconcileCall(tenantId,parsed.id);
    await query("update telephony_webhook_events set status='processed',attempts=attempts+1,processed_at=now() where provider='vobiz' and event_key=$1 and tenant_id=$2",[key,tenantId]);
  } catch (error) {
    await query("update telephony_webhook_events set status='failed',attempts=attempts+1 where provider='vobiz' and event_key=$1 and tenant_id=$2",[key,tenantId]);
    throw error;
  }
}
