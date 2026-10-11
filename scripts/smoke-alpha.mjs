// Read-only local/staging control-plane smoke. Never invokes Gemini or Vobiz.
import nextEnv from '@next/env';
import {Pool} from 'pg';
nextEnv.loadEnvConfig(process.cwd());
const required=['DATABASE_URL','BETTER_AUTH_SECRET','BETTER_AUTH_URL','BRIDGE_AUTH_SECRET','TENANT_SECRETS_ENCRYPTION_KEY'];
const missing=required.filter(key=>!process.env[key]);
if(missing.length){console.error(JSON.stringify({check:'configuration',missing}));process.exitCode=1;}
else {
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:15000,query_timeout:15000});
 try {
  const result=await pool.query(`select
   (select count(*)::int from public.schema_migrations where name like '012_%' or name like '013_%' or name like '014_%' or name like '015_%') as alpha_migrations,
   (select count(*)::int from plans where code in('alpha','internal') and active) as plans,
   (select count(*)::int from tenants t left join tenant_subscriptions s on s.tenant_id=t.id left join tenant_ai_configuration a on a.tenant_id=t.id where s.tenant_id is null or a.tenant_id is null) as missing_tenant_configuration,
   (select phone_enabled from platform_usage_controls where id=1) as phone_enabled,
   (select purchase_enabled from platform_usage_controls where id=1) as purchase_enabled`);
  const r=result.rows[0];
  const blockers=[];
  if(r.alpha_migrations!==4||r.plans!==2||r.missing_tenant_configuration!==0)blockers.push('database_configuration');
  if(!process.env.PLATFORM_GEMINI_API_KEY?.trim())blockers.push('platform_gemini_key');
  if(!process.env.PLATFORM_ADMIN_USER_IDS)blockers.push('operator_user_id_allowlist');
  if(process.env.ALPHA_INVITE_ISSUANCE_ENABLED!=='1')blockers.push('invitation_issuance_disabled');
  console.log(JSON.stringify({check:'alpha_control_plane',...r,provider_attestation:process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED==='1',configuration_blockers:blockers,paid_provider_operations:'NOT_RUN',gemini_response:'NOT_RUN'}));
  if(blockers.includes('database_configuration')||(process.argv.includes('--strict')&&blockers.length))process.exitCode=1;
  const origin=process.env.SMOKE_APP_ORIGIN;
  if(origin){const url=new URL('/api/health',origin);const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});console.log(JSON.stringify({check:'app_health',status:response.status}));if(!response.ok)process.exitCode=1;}
  const bridge=process.env.SMOKE_BRIDGE_ORIGIN;
  if(bridge){const response=await fetch(new URL('/health',bridge),{redirect:'error',signal:AbortSignal.timeout(10000)});console.log(JSON.stringify({check:'bridge_health',status:response.status}));if(!response.ok)process.exitCode=1;}
 }catch(error){console.error(JSON.stringify({check:'smoke_failed',code:error.code??'check_failed'}));process.exitCode=1;}
 finally{await pool.end();}
}
