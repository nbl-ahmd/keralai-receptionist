import { domainRoute } from '@/lib/telephony/http';
import { ensureCustomerAccount, phoneSummary } from '@/lib/telephony/service';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = (r: Request) => domainRoute(r,phoneSummary);
export const POST = (r: Request) => domainRoute(r,async id => { await ensureCustomerAccount(id,r); return phoneSummary(id); },true);
