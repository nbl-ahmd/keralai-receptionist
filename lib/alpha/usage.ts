import {transaction} from '@/db/transaction';
import {loadEntitlement,usageTotals} from '@/bridge/entitlements.mjs';
import {wallet} from '@/lib/telephony/store';
export async function tenantUsage(tenantId:string) {
 const [plan,balance]=await Promise.all([transaction(async c=>{
  const row=await loadEntitlement(c,tenantId);if(!row)return null;
  const totals=await usageTotals(c,tenantId,row.period_start);
  const confirmed=(await c.query(`select coalesce(sum(used_seconds) filter(where kind='phone' and settlement='settled'),0) as phone,
   coalesce(sum(used_seconds) filter(where kind<>'phone' and settlement='settled'),0) as browser
   from alpha_voice_sessions where tenant_id=$1 and period_start=$2`,[tenantId,row.period_start])).rows[0];
  return {name:row.display_name,code:row.plan_code,status:row.status,voiceEnabled:row.voice_enabled&&row.tenant_status==='active',
   phoneActivationApproved:row.phone_activation_approved,
   periodStart:row.period_start,periodEnd:row.period_end,includedMinutes:row.limits.phone_minutes,
   usedMinutes:Math.ceil(Number(confirmed.phone)/60),reservedMinutes:Math.ceil((Number(totals.phone_seconds)-Number(confirmed.phone))/60),
   remainingMinutes:Math.max(0,Math.floor((row.limits.phone_minutes*60-Number(totals.phone_seconds))/60)),
   browserUsedSeconds:Number(confirmed.browser),browserRemainingSeconds:Math.max(0,row.limits.browser_seconds-Number(totals.browser_seconds)),
   maxConcurrentCalls:row.limits.phone_concurrency,maxConcurrentBrowser:row.limits.browser_concurrency,maxSessionSeconds:row.limits.max_session_seconds};
 }),wallet(tenantId)]);
 return {plan,wallet:balance};
}
