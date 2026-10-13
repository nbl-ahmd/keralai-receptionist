import { NextResponse } from 'next/server';
import { requirePlatformAdmin,adminAction,adminSnapshot } from '@/lib/telephony/admin';
import { limitOperation } from '@/lib/telephony/store';
import { HttpError } from '@/lib/auth/context';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function handle(r:Request,mutate:boolean){
 try{
  const actor=await requirePlatformAdmin(r);
  if(mutate){
   const expected=new URL(process.env.BETTER_AUTH_URL??r.url).origin;
   if(r.headers.get('origin')!==expected)throw new HttpError(403,'Invalid request origin');
   if((await r.clone().text()).length>8192)throw new HttpError(413,'Request too large');
   const b=await r.json();
   if(typeof b.tenantId!=='string'||!/^[a-f0-9-]{36}$/i.test(b.tenantId)||typeof b.action!=='string'||(b.numberId&&!/^[a-f0-9-]{36}$/i.test(b.numberId)))throw new HttpError(400,'Invalid action');
   await limitOperation(b.tenantId,`admin:telephony:${actor.id}`,6);
   await adminAction(actor.id,b);
   return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }
  const page=Math.max(1,Math.min(10000,Math.trunc(Number(new URL(r.url).searchParams.get('page'))||1)));
  return NextResponse.json({items:await adminSnapshot(page),page},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof HttpError?e.message:'Administrator operation failed'},{status:e instanceof HttpError?e.status:500});}
}
export const GET=(r:Request)=>handle(r,false);
export const POST=(r:Request)=>handle(r,true);
