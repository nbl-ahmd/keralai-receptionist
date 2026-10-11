import {resolveTenantContext,HttpError,handleApiError} from '@/lib/auth/context';
import {requireCapability} from '@/lib/alpha/entitlements';
import {query} from '@/db/client';
import {transaction} from '@/db/transaction';
import {limitOperation} from '@/lib/telephony/store';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 try {
  const context=await resolveTenantContext(request,{roles:['owner','admin']});
  if(request.headers.get('origin')!==new URL(process.env.BETTER_AUTH_URL??request.url).origin)throw new HttpError(403,'Invalid request origin.');
  if((await request.clone().text()).length>2048)throw new HttpError(413,'Request too large.');
  await limitOperation(context.tenantId,'ai-mode',6);
  const {mode}=await request.json();
  if(!['platform_managed','tenant_managed'].includes(mode))throw new HttpError(400,'Unknown AI mode.');
  if(mode==='tenant_managed')await requireCapability(context.tenantId,'byok');
  else await requireCapability(context.tenantId,'assistant_edit');
  await transaction(async c=>{
   await c.query('update tenant_ai_configuration set credential_mode=$2,updated_at=now() where tenant_id=$1',[context.tenantId,mode]);
   await c.query("insert into platform_audit_events(actor_id,tenant_id,action,reason) values($1,$2,'ai.mode.changed',$3)",[context.userId,context.tenantId,`Selected ${mode}`]);
  });
  const rows=await query('select credential_mode from tenant_ai_configuration where tenant_id=$1',[context.tenantId]);
  return Response.json({mode:rows[0].credential_mode},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return handleApiError(e,'Unable to change AI connection.');}
}
