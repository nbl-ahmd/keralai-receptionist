import { domainRoute } from '@/lib/telephony/http';
import { syncKyc, phoneSummary } from '@/lib/telephony/service';
export const dynamic = 'force-dynamic';
export const GET = (r: Request) => domainRoute(r,phoneSummary);
export const POST = (r: Request) => domainRoute(r,async (id, provider) => { await syncKyc(id,provider); return phoneSummary(id,provider); },true);
