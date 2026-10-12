import {NextResponse} from 'next/server';
import {HttpError} from '@/lib/auth/context';
import {requirePlatformAdmin} from '@/lib/telephony/admin';
import {telephonyReadiness} from '@/lib/telephony/readiness';
export const dynamic='force-dynamic';
export const maxDuration=30;
export async function GET(request:Request) {
 try {
  await requirePlatformAdmin(request);
  const params=new URL(request.url).searchParams,tenantId=params.get('tenantId')??undefined;
  if(tenantId&&!/^[a-f0-9-]{36}$/i.test(tenantId))throw new HttpError(400,'Invalid workspace');
  const result=await telephonyReadiness(tenantId,params.get('probeBridge')==='1');
  if(!result)throw new HttpError(404,'Workspace not found');
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(error) {
  return NextResponse.json({error:error instanceof HttpError?error.message:'Readiness checks are unavailable.'},
   {status:error instanceof HttpError?error.status:503,headers:{'Cache-Control':'private, no-store'}});
 }
}
