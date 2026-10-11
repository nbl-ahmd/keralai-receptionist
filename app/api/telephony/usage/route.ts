import { domainRoute } from '@/lib/telephony/http';
import { query } from '@/db/client';
export const dynamic='force-dynamic';
export const GET=(r:Request)=>domainRoute(r,async id=>{
 const page=Math.min(10000,Math.max(1,Number(new URL(r.url).searchParams.get('page'))||1));
 return {items:await query(`select id,direction,started_at,ended_at,duration_seconds,billable_seconds,customer_charge_minor,billing_status,call_status
 from telephony_usage_events where tenant_id=$1 order by started_at desc limit 25 offset $2`,[id,(Math.trunc(page)-1)*25])};
});
