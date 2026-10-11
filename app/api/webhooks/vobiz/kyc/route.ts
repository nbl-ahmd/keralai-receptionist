import { query, queryOne } from '@/db/client';
import { getTelephonyProvider } from '@/lib/telephony/provider';
import { syncKyc } from '@/lib/telephony/service';
import { eventHash } from '@/lib/telephony/providers/vobiz/webhooks';
export const POST=async(r:Request)=>{
 try {
  const raw=await r.text(); if(raw.length>32768 || !getTelephonyProvider().verifyKycWebhook({rawBody:raw,headers:r.headers})) return new Response(null,{status:403});
  const body=JSON.parse(raw);
  if(typeof body.account_auth_id!=='string' || typeof body.session_id!=='string' || !['kyc.initiated','kyc.submitted','kyc.completed','kyc.failed','kyc.session_expired','kyc.session_revoked'].includes(body.event)) return new Response(null,{status:400});
  const account=await queryOne<{tenant_id:string;id:string}>("select tenant_id,id from tenant_telephony_accounts where provider='vobiz' and provider_auth_id=$1 and kyc_session_id=$2",[body.account_auth_id,body.session_id]);
  if(!account) return new Response(null,{status:204});
  const key=eventHash(raw);
  await query(`insert into telephony_webhook_events(provider,event_key,tenant_id,event_type) values('vobiz',$1,$2,$3) on conflict do nothing`,[key,account.tenant_id,body.event]);
  const event=await queryOne<{status:string}>("select status from telephony_webhook_events where provider='vobiz' and event_key=$1 and tenant_id=$2",[key,account.tenant_id]);
  if(event?.status==='processed') return new Response(null,{status:204});
  // Never unlock from the body, or from redirect query parameters.
  await syncKyc(account.tenant_id);
  const status=typeof body.session_status==='string' && ['email_sent','link_ready','opened','in_progress','kyc_completed','revoked','expired','failed'].includes(body.session_status) ? body.session_status : body.event.slice(4);
  await query('update tenant_telephony_accounts set kyc_session_status=$3,updated_at=now() where tenant_id=$1 and id=$2 and kyc_session_id=$4',[account.tenant_id,account.id,status,body.session_id]);
  await query("update telephony_webhook_events set status='processed',attempts=attempts+1,processed_at=now() where provider='vobiz' and event_key=$1 and tenant_id=$2",[key,account.tenant_id]);
  return new Response(null,{status:204});
 }catch{return new Response(null,{status:503});}
};
