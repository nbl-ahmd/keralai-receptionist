import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {alphaConfiguration} from './alpha-config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const keys = ['TELEPHONY_PUBLIC_ORIGIN','BRIDGE_PUBLIC_URL','NEXT_PUBLIC_BRIDGE_WS_URL','ALPHA_MAX_DID_SETUP_COST_MINOR','ALPHA_MAX_DID_MONTHLY_COST_MINOR','ALPHA_DID_RELEASE_COST_MINOR','ALPHA_MAX_DID_RELEASE_COST_MINOR','ALPHA_MAX_DID_COMMITMENT_MONTHS','ALPHA_MIN_VOBIZ_BALANCE_MINOR','DATABASE_URL','BRIDGE_AUTH_SECRET','TENANT_SECRETS_ENCRYPTION_KEY','PLATFORM_GEMINI_API_KEY','BETTER_AUTH_SECRET','BETTER_AUTH_URL','NEXT_PUBLIC_APP_URL','PLATFORM_ADMIN_USER_IDS','ALPHA_INVITE_ISSUANCE_ENABLED','PUBLIC_APP_ORIGIN','AI_ENVIRONMENT','TEST_SCHEMA','KERALAI_TEST_SCHEMA','PLATFORM_BROWSER_VOICE_ENABLED','PLATFORM_NEW_PHONE_CALLS_ENABLED','PLATFORM_NUMBER_PURCHASE_ENABLED','VOBIZ_CALLBACK_SIGNATURES_VERIFIED','VOBIZ_AUTH_ID','VOBIZ_AUTH_TOKEN','CRON_SECRET','PHONE_MONTHLY_PRICE_MINOR','PHONE_SETUP_PRICE_MINOR','CALL_PRICE_PER_MINUTE_MINOR','PROVIDER_VOICE_RESERVE_MINOR_PER_MINUTE'];
function read(bridge) {
  const setup = bridge ? "await import('./bridge/env.mjs');" : "const {default:env}=await import('@next/env');env.loadEnvConfig(process.cwd(),false,{info(){},error(){}});";
  const child=spawnSync(process.execPath,['--input-type=module','-e',`${setup}process.stdout.write(JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map(k=>[k,process.env[k]??'']))));`],{cwd:root,encoding:'utf8',timeout:10000});
  if(child.status!==0)throw new Error('Cannot read service configuration');
  return JSON.parse(child.stdout);
}
try {
  const result=alphaConfiguration(read(false),read(true));
  console.log(JSON.stringify({check:'local_alpha_configuration',...result}));
  if(process.argv.includes('--strict') && result.browserBlockers.length)process.exitCode=1;
  if(process.argv.includes('--phone') && (result.browserBlockers.length || result.phoneBlockers.length))process.exitCode=1;
} catch {console.error('Alpha configuration check failed; no credentials printed.');process.exitCode=1;}
