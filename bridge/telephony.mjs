import { claimVoiceSession } from './entitlements.mjs';
import { dbQuery, withTransaction } from './db.mjs';

export async function authorizePhoneBridge(claims) {
  if(process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED!=='1') return null;
  if(claims.provider!=='vobiz' || claims.scope!=='phone' || typeof claims.phone_number_id!=='string' ||
    typeof claims.provider_call_id!=='string' || typeof claims.nonce!=='string' ||
    !/^[a-f0-9-]{36}$/i.test(claims.tid) || !/^[a-f0-9-]{36}$/i.test(claims.phone_number_id) ||
    !Number.isFinite(claims.iat) || claims.exp-claims.iat>120 || claims.iat>Math.floor(Date.now()/1000)+5) return null;
  return withTransaction(async client=> {
    const route=await client.query(`select t.id,t.slug,t.name,u.from_number,u.rate_per_minute_minor,u.id as usage_id
      from phone_numbers n join tenants t on t.id=n.tenant_id
      join tenant_telephony_accounts a on a.tenant_id=n.tenant_id and a.id=n.telephony_account_id
      join telephony_usage_events u on u.tenant_id=n.tenant_id and u.phone_number_id=n.id
      where t.id=$1 and n.id=$2 and n.provider='vobiz' and n.status='active' and t.status='active'
      and a.status='active' and a.kyc_calls_blocked=false and u.provider_call_id=$3 and u.ended_at is null`,
      [claims.tid,claims.phone_number_id,claims.provider_call_id]);
    if(!route.rows[0]) return null;
    const session=await claimVoiceSession(claims,work=>work(client));
    if(!session) return null;
    const account=await client.query('select status from wallet_accounts where tenant_id=$1',[claims.tid]);
    if(account.rows[0]?.status!=='active')throw new Error('Wallet authorization unavailable');
    const row=route.rows[0];
    const reserved=await client.query(`update telephony_usage_events set call_status='connecting',updated_at=now()
      where tenant_id=$1 and phone_number_id=$2 and provider_call_id=$3 and alpha_session_id=$4
      and reserved_minor=$5 and reserved_minor>0 returning id`,
      [claims.tid,claims.phone_number_id,claims.provider_call_id,session.id,session.reserved_minor]);
    if(!reserved.rows.length)throw new Error('Call reservation unavailable');
    return {tenant:{id:row.id,slug:row.slug,name:row.name},from:row.from_number,
      authorization:session,maxDurationMs:Math.max(1,new Date(session.expires_at).getTime()-Date.now())};
  }).catch(()=>null);
}
export async function markPhoneConnection(claims,state) {
  await dbQuery(`update telephony_usage_events set call_status=case when call_status='failed' and $4='disconnected' then call_status else $4 end,updated_at=now()
    where tenant_id=$1 and phone_number_id=$2 and provider_call_id=$3 and billing_status='pending'`,
    [claims.tid,claims.phone_number_id,claims.provider_call_id,state]);
  console.info(JSON.stringify({event:`vobiz.websocket.${state}`,tenantId:claims.tid}));
}
