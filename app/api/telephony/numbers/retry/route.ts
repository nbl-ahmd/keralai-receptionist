import { domainRoute } from '@/lib/telephony/http';
import { retryNumber, phoneSummary } from '@/lib/telephony/service';
import { HttpError } from '@/lib/auth/context';
export const maxDuration = 60;
export const POST = (r: Request) => domainRoute(r,async id => {
 const b=await r.json(); if(typeof b.id!=='string' || !/^[a-f0-9-]{36}$/.test(b.id)) throw new HttpError(400,'Invalid number');
 await retryNumber(id,b.id); return phoneSummary(id);
},true);
