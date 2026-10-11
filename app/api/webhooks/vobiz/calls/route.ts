import { callWebhook } from '@/lib/telephony/inbound';
import { HttpError } from '@/lib/auth/context';
export const POST=async(r:Request)=>{
 try { await callWebhook(r); return new Response(null,{status:200}); }
 catch(e) { return new Response(null,{status:e instanceof HttpError && e.status<500 ? e.status:503}); }
};
