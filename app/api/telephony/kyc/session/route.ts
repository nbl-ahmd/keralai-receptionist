import { domainRoute } from '@/lib/telephony/http';
import { startKyc } from '@/lib/telephony/service';
export const POST = (r: Request) => domainRoute(r,startKyc,true);
