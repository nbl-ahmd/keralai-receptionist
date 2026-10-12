import { domainRoute } from '@/lib/telephony/http';
import { requestNumberRelease, phoneSummary } from '@/lib/telephony/service';
import { HttpError,requireUserId } from '@/lib/auth/context';
export const maxDuration = 60;
export const POST = (r: Request) => domainRoute(r,async id => {
 const b=await r.json(); if(typeof b.id!=='string' || !/^[a-f0-9-]{36}$/.test(b.id)) throw new HttpError(400,'Invalid number');
 const actor=await requireUserId(r);await requestNumberRelease(id,b.id,actor.id); return phoneSummary(id);
},true);
