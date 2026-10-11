import crypto from 'node:crypto';
import { reconcileTelephony } from '@/lib/telephony/reconcile';
export const dynamic='force-dynamic';
export const maxDuration=300;
export const GET=async(r:Request)=>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return new Response(null,{status:503});
 const a=Buffer.from(r.headers.get('authorization')??''),b=Buffer.from(`Bearer ${secret}`);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return new Response(null,{status:403});
 try{return Response.json(await reconcileTelephony(),{headers:{'Cache-Control':'no-store'}});}catch{return new Response(null,{status:503});}
};
