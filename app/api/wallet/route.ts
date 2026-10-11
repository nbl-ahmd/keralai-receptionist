import { domainRoute } from '@/lib/telephony/http';
import { query } from '@/db/client';
import { wallet } from '@/lib/telephony/store';
export const dynamic='force-dynamic';
export const GET=(r:Request)=>domainRoute(r,async id=>({wallet:await wallet(id),paymentsEnabled:false,transactions:await query(
 'select id,type,amount_minor,currency,created_at from wallet_transactions where tenant_id=$1 order by created_at desc limit 50',[id])}));
