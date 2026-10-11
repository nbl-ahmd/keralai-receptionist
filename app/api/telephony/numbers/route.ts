import { domainRoute } from '@/lib/telephony/http';
import { phoneSummary } from '@/lib/telephony/service';
export const dynamic = 'force-dynamic';
export const GET = (r: Request) => domainRoute(r,phoneSummary);
