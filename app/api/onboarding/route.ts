import { requireCapability } from '@/lib/alpha/entitlements';
import { isPlatformManagedAi } from '@/lib/gemini';
import { domainRoute } from '@/lib/telephony/http';
import { query,queryOne } from '@/db/client';
import { getProfile,saveProfile } from '@/lib/store';
import { HttpError } from '@/lib/auth/context';
export const dynamic='force-dynamic';
async function state(tenantId:string) {
  await query('insert into tenant_onboarding(tenant_id) values($1) on conflict do nothing',[tenantId]);
  const [onboarding,profile]=await Promise.all([
    queryOne('select purpose,step,browser_test_completed_at,completed_at from tenant_onboarding where tenant_id=$1',[tenantId]),getProfile(tenantId)]);
  return {onboarding,profile,managedAi:await isPlatformManagedAi(tenantId)};
}
export const GET=(r:Request)=>domainRoute(r,state);
export const POST=(r:Request)=>domainRoute(r,async tenantId=>{
  await requireCapability(tenantId,'assistant_edit');
  const b=await r.json();
  const steps=['purpose','identity','behavior','knowledge','test','phone','complete'];
  if(!steps.includes(b.step) || !['personal','business','other'].includes(b.purpose)) throw new HttpError(400,'Invalid setup step');
  const profile=await getProfile(tenantId);
  if(b.profile) {
    for(const key of ['name','assistantName','assistantLanguage','description','assistantInstructions'])
      if(typeof b.profile[key]!=='string' || b.profile[key].length>4000) throw new HttpError(400,'Check your assistant details');
    await saveProfile(tenantId,{...profile,name:b.profile.name,assistantName:b.profile.assistantName,
      assistantLanguage:b.profile.assistantLanguage,description:b.profile.description,
      assistantInstructions:b.profile.assistantInstructions,assistantPurpose:b.purpose});
  }
  await query(`insert into tenant_onboarding(tenant_id,purpose,step,completed_at) values($1,$2,$3,case when $3='complete' then now() else null end)
    on conflict(tenant_id) do update set purpose=excluded.purpose,step=excluded.step,completed_at=excluded.completed_at,updated_at=now()`,[tenantId,b.purpose,b.step]);
  return state(tenantId);
},true,20);
