import { domainRoute } from '@/lib/telephony/http';
import { purchaseNumber, phoneSummary } from '@/lib/telephony/service';
export const maxDuration = 60;
export const POST = (r: Request) => domainRoute(r,async id => { const b=await r.json(); await purchaseNumber(id,{e164:b.e164,key:r.headers.get('idempotency-key')}); return phoneSummary(id); },true);
