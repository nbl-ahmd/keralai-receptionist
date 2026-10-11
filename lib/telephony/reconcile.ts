import { query } from '@/db/client';
import { transaction } from '@/db/transaction';
import { reconcileCall } from './inbound';
import { retryNumber,syncKyc,releaseNumber } from './service';
import { observe } from './store';

export async function reconcileTelephony() {
  const report={calls:0,numbers:0,kyc:0,rentals:0,failures:0,timeLimited:false};
  const deadline=Date.now()+240000;
  const hasBudget=()=>Date.now()<deadline;
  const rentals=await query<{tenant_id:string;id:string}>(`select tenant_id,id from phone_numbers
    where status in ('active','suspended') and next_rental_at<=now() order by next_rental_at limit 50`);
  for(const number of rentals) {
    if(!hasBudget())break;
    try{await transaction(async client=>{
      await client.query('select tenant_id from wallet_accounts where tenant_id=$1 for update',[number.tenant_id]);
      const row=await client.query('select * from phone_numbers where tenant_id=$1 and id=$2 and next_rental_at<=now() for update',[number.tenant_id,number.id]);
      if(!row.rows.length)return;
      const balance=await client.query(`select coalesce((select sum(amount_minor) from wallet_transactions where tenant_id=$1),0)-
        coalesce((select sum(amount_minor) from wallet_holds where tenant_id=$1 and status='reserved'),0)-
        coalesce((select sum(reserved_minor) from telephony_usage_events where tenant_id=$1 and billing_status='pending'),0) as available`,[number.tenant_id]);
      const n=row.rows[0],amount=Number(n.customer_monthly_price_minor);
      if(BigInt(balance.rows[0].available)<BigInt(amount)) {
        await client.query("update phone_numbers set status='suspended',error_code='low_balance',updated_at=now() where tenant_id=$1 and id=$2",[number.tenant_id,number.id]);return;
      }
      const key=`rental:${number.id}:${new Date(n.next_rental_at).toISOString()}`;
      await client.query(`insert into wallet_transactions(tenant_id,type,amount_minor,reference_type,reference_id,idempotency_key)
        values($1,'number_rental',$2,'phone_number',$3,$4) on conflict(tenant_id,idempotency_key) do nothing`,[number.tenant_id,-amount,number.id,key]);
      await client.query("update phone_numbers set next_rental_at=next_rental_at+interval '30 days',updated_at=now() where tenant_id=$1 and id=$2",[number.tenant_id,number.id]);
      report.rentals++;
    });}catch{report.failures++;}
  }
  const pending=await query<{tenant_id:string;provider_call_id:string}>(`select tenant_id,provider_call_id from telephony_usage_events
    where billing_status='pending' and started_at<now()-interval '2 minutes' order by updated_at limit 20`);
  for(const call of pending) {
    if(!hasBudget())break;
    try{await reconcileCall(call.tenant_id,call.provider_call_id);report.calls++;}
    catch{report.failures++;}
  }
  const numbers=await query<{tenant_id:string;id:string;provisioning_status:string}>(`select tenant_id,id,provisioning_status from phone_numbers where
    provisioning_status in ('purchasing','purchase_unknown','purchased','configuring','configuration_failed','release_unknown')
    and updated_at<now()-interval '2 minutes' order by updated_at limit 5`);
  for(const number of numbers){if(!hasBudget())break;try{await (number.provisioning_status==='release_unknown' ? releaseNumber(number.tenant_id,number.id):retryNumber(number.tenant_id,number.id));report.numbers++;}catch{report.failures++;}}
  const accounts=await query<{tenant_id:string}>(`select tenant_id from tenant_telephony_accounts where status='active'
    and (kyc_last_checked_at is null or kyc_last_checked_at<now()-interval '1 hour') order by kyc_last_checked_at nulls first limit 10`);
  for(const account of accounts){if(!hasBudget())break;try{await syncKyc(account.tenant_id);report.kyc++;}catch{report.failures++;}}
  // Retain nonce digests for a week, including used bridge tokens; no PII/raw bodies.
  await query("delete from telephony_nonces where expires_at<now()-interval '7 days'");
  await query("delete from telephony_rate_limits where window_start<now()-interval '1 day'");
  report.timeLimited=!hasBudget();
  observe('telephony.reconciliation.completed','platform');
  return report;
}
