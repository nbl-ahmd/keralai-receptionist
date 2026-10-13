import {assertParentFunding} from './did-policy';
import {authorizeUsage,loadEntitlement,tenantSpend,providerDidExposure} from '@/bridge/entitlements.mjs';
import { query, queryOne } from '@/db/client';
import { transaction } from '@/db/transaction';
import { HttpError } from '@/lib/auth/context';
import type { TelephonyAccountRow, PhoneNumberRow } from './types';

export const getAccount = (tenantId: string, provider = process.env.TELEPHONY_PROVIDER ?? 'vobiz') => queryOne<TelephonyAccountRow>(
  'select * from tenant_telephony_accounts where tenant_id=$1 and provider=$2', [tenantId, provider]);
export const getNumber = (tenantId: string, id: string) => queryOne<PhoneNumberRow>(
  'select * from phone_numbers where tenant_id=$1 and id=$2', [tenantId,id]);
export const getNumbers = (tenantId: string, provider?: string) => query<PhoneNumberRow>(
  "select * from phone_numbers where tenant_id=$1 and ($2::text is null or provider=$2) and status <> 'released' order by created_at desc", [tenantId, provider ?? null]);

export async function withOperationLock<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
  return transaction(async (client) => {
    const result = await client.query('select pg_try_advisory_xact_lock(hashtextextended($1,0)) as locked', [`telephony:${tenantId}`]);
    if (!result.rows[0].locked) throw new HttpError(409, 'Phone setup is already in progress. Refresh in a moment.');
    // State writes below commit independently: process crashes leave recoverable progress.
    return work();
  });
}
export async function limitOperation(tenantId: string, operation: string, limit = 10) {
  const row = await queryOne<{ requests: number }>(`insert into telephony_rate_limits (tenant_id,operation,window_start)
    values ($1,$2,date_trunc('minute',now())) on conflict (tenant_id,operation,window_start)
    do update set requests=telephony_rate_limits.requests+1 returning requests`, [tenantId,operation]);
  if (!row || row.requests > limit) throw new HttpError(429, 'Please wait a minute before trying again.');
}
export async function requireActiveTenant(tenantId: string) {
  const tenant = await queryOne<{ status: string }>('select status from tenants where id=$1',[tenantId]);
  if (tenant?.status !== 'active') throw new HttpError(403, 'This workspace is suspended. Contact support.');
}
export async function wallet(tenantId: string) {
  const row = await queryOne<{ balance: string; held: string; status: string }>(`select w.status,
    coalesce((select sum(amount_minor) from wallet_transactions where tenant_id=w.tenant_id),0)::text as balance,
    (coalesce((select sum(amount_minor) from wallet_holds where tenant_id=w.tenant_id and status='reserved'),0)+
    coalesce((select sum(reserved_minor) from telephony_usage_events where tenant_id=w.tenant_id and billing_status='pending'),0))::text as held
    from wallet_accounts w where w.tenant_id=$1`, [tenantId]);
  const balanceMinor = Number(row?.balance ?? 0), heldMinor = Number(row?.held ?? 0);
  if (!Number.isSafeInteger(balanceMinor) || !Number.isSafeInteger(heldMinor)) throw new HttpError(503,'Balance requires review');
  return { balanceMinor, heldMinor, availableMinor: balanceMinor-heldMinor, status: row?.status ?? 'active', currency: 'INR' };
}
export async function initWallet(tenantId: string) {
  await query('insert into wallet_accounts (tenant_id) values ($1) on conflict do nothing',[tenantId]);
}
export async function reserveNumber(input: {
  tenantId: string; accountId: string; provider: string; e164: string; region: string; providerNumberId: string;
  monthlyCost: string; monthlyPrice: number; setupPrice: number; providerExposure: number; parentBalance: {availableMinor:number;active:boolean}; charge: number; key: string;
}): Promise<PhoneNumberRow> {
  await initWallet(input.tenantId);
  return transaction(async (client) => {
    const control=(await client.query('select * from platform_usage_controls where id=1 for update')).rows[0];
    const calls=Number((await client.query("select coalesce(sum(coalesce(provider_actual_minor,provider_reserved_minor)),0) as amount from alpha_voice_sessions where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'")).rows[0].amount);
    const totalExposure=calls+await providerDidExposure(client)+input.providerExposure;
    assertParentFunding(input.parentBalance,totalExposure);
    if(totalExposure>Number(control.monthly_provider_cap_minor))throw new HttpError(402,'Platform provider allowance is used. Contact your organiser.');
    const decision=await authorizeUsage(input.tenantId,'number_purchase',(work: (connection: import('pg').PoolClient) => Promise<unknown>)=>work(client));
    if(!decision.allowed)throw new HttpError(403,decision.reason);
    const subscription=await loadEntitlement(client,input.tenantId);
    const cap=Math.min(subscription.limits.monthly_spend_minor,subscription.spend_cap_minor===null?Infinity:Number(subscription.spend_cap_minor));
    if(await tenantSpend(client,input.tenantId,subscription.period_start,subscription.period_end)+input.charge>cap)throw new HttpError(402,'Workspace spending limit reached. Contact your organiser.');
    const account = await client.query('select status from wallet_accounts where tenant_id=$1 for update',[input.tenantId]);
    const totals = await client.query(`select
      coalesce((select sum(amount_minor) from wallet_transactions where tenant_id=$1),0)-
      coalesce((select sum(amount_minor) from wallet_holds where tenant_id=$1 and status='reserved'),0)-
      coalesce((select sum(reserved_minor) from telephony_usage_events where tenant_id=$1 and billing_status='pending'),0) as available`,[input.tenantId]);
    if (account.rows[0].status !== 'active' || BigInt(totals.rows[0].available) < BigInt(input.charge))
      throw new HttpError(402, 'Ask your Alpha operator for testing credit before activating your number.');
    const result = await client.query(`insert into phone_numbers
      (tenant_id,telephony_account_id,provider,provider_number_id,e164,region,provider_monthly_cost,
      customer_monthly_price_minor,initial_charge_minor,idempotency_key,initial_setup_price_minor,provider_exposure_minor,status,provisioning_status)
      values ($1,$2,$10,$3,$4,$5,$6,$7,$8,$9,$11,$12,'provisioning','purchasing') returning *`,
      [input.tenantId,input.accountId,input.providerNumberId,input.e164,input.region,input.monthlyCost,input.monthlyPrice,input.charge,input.key,input.provider,input.setupPrice,input.providerExposure]);
    await client.query('insert into wallet_holds (tenant_id,phone_number_id,amount_minor) values ($1,$2,$3)',
      [input.tenantId,result.rows[0].id,input.charge]);
    return result.rows[0];
  });
}
export async function activateNumber(tenantId: string, id: string) {
  await transaction(async (client) => {
    const account = await client.query('select status from wallet_accounts where tenant_id=$1 for update',[tenantId]);
    if (account.rows[0]?.status !== 'active') throw new HttpError(402,'Balance is suspended. Contact support.');
    const result = await client.query("select * from phone_numbers where tenant_id=$1 and id=$2 and provisioning_status='configuring' for update",[tenantId,id]);
    const number = result.rows[0];
    if (!number) throw new HttpError(409, 'Phone setup changed. Refresh and try again.');
    const charges=number.initial_setup_price_minor===null?
      [['number_rental',Number(number.initial_charge_minor),'initial']]:
      [['number_setup',Number(number.initial_setup_price_minor),'setup'],['number_rental',Number(number.customer_monthly_price_minor),'rental:initial']];
    for(const [type,amount,suffix] of charges)if(Number(amount)>0)await client.query(`insert into wallet_transactions (tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key)
      values ($1,$2,$3,'phone_number',$4,$5) on conflict (tenant_id,idempotency_key) do nothing`,
      [tenantId,type,-Number(amount),id,`number:${id}:${suffix}`]);
    await client.query("update wallet_holds set status='captured',updated_at=now() where tenant_id=$1 and phone_number_id=$2 and status='reserved'",[tenantId,id]);
    await client.query(`update phone_numbers set status='active',provisioning_status='active',error_code=null,
      activated_at=coalesce(activated_at,now()),next_rental_at=coalesce(next_rental_at,now()+interval '30 days'),updated_at=now()
      where tenant_id=$1 and id=$2`,[tenantId,id]);
  });
}
export function observe(event: string, tenantId: string, resourceId?: string, code?: string) {
  console.info(JSON.stringify({ event, tenantId, resourceId, code }));
}
