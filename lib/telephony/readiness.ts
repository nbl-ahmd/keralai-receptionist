import {query,queryOne} from '@/db/client';
import {releaseInfo} from '@/bridge/release-info.mjs';
import {didPolicy} from './did-policy';
import {price,publicOrigin} from './policy';
import {phoneSummary} from './service';
import {authorizeUsage} from '@/lib/alpha/entitlements';

export async function telephonyReadiness(tenantId?:string,probeBridge=false) {
 const checks:Array<{key:string;label:string;ready:boolean}>=[];
 const check=(key:string,label:string,ready:boolean)=>checks.push({key,label,ready});
 const validates=(work:()=>unknown)=>{try{work();return true;}catch{return false;}};
 check('provider','Vobiz parent credentials configured',!!process.env.VOBIZ_AUTH_ID?.trim()&&!!process.env.VOBIZ_AUTH_TOKEN?.trim());
 check('signatures','App callback signature attestation enabled',process.env.VOBIZ_CALLBACK_SIGNATURES_VERIFIED==='1');
 check('purchaseSwitch','App number purchase switch enabled',process.env.PLATFORM_NUMBER_PURCHASE_ENABLED!=='0');
 check('phoneSwitch','App incoming phone switch enabled',process.env.PLATFORM_NEW_PHONE_CALLS_ENABLED!=='0');
 check('policy','Approved DID pricing and funding policy configured',validates(()=>didPolicy()));
 check('prices','Positive customer setup, rental and call prices configured',validates(()=>{
  for(const key of ['PHONE_SETUP_PRICE_MINOR','PHONE_MONTHLY_PRICE_MINOR','CALL_PRICE_PER_MINUTE_MINOR','PROVIDER_VOICE_RESERVE_MINOR_PER_MINUTE'])price(key);
 }));
 check('origin','Phone callbacks use the canonical HTTPS app origin',validates(()=>{
  if(publicOrigin()!==new URL(process.env.BETTER_AUTH_URL??'').origin)throw new Error();
 }));
 let bridgeUrl:URL|undefined;
 const bridgeConfigured=validates(()=>{
  const url=new URL(process.env.BRIDGE_PUBLIC_URL??'');
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error();
  bridgeUrl=url;
 });
 check('bridge','HTTPS bridge origin configured',bridgeConfigured);
 check('bridgeAuth','Bridge signing secret configured on app',!!process.env.BRIDGE_AUTH_SECRET);
 check('cron','Reconciliation job authentication configured',!!process.env.CRON_SECRET);
 const columns=await query<{table_name:string;column_name:string}>(`select table_name,column_name from information_schema.columns
  where table_schema=current_schema() and ((table_name='tenant_subscriptions' and column_name='phone_activation_approved')
  or (table_name='phone_numbers' and column_name in ('initial_setup_price_minor','provider_exposure_minor','release_requested_at','release_requested_by')))`);
 const migration016=columns.length===5;
 check('migration016','Migration 016 schema changes present',migration016);
 const controls=await queryOne<{purchase_enabled:boolean;phone_enabled:boolean}>('select purchase_enabled,phone_enabled from platform_usage_controls where id=1');
 check('platformPurchase','Platform number purchases enabled',controls?.purchase_enabled===true);
 check('platformPhone','Platform phone calls enabled',controls?.phone_enabled===true);
 if(tenantId) {
  if(!await queryOne('select id from tenants where id=$1',[tenantId]))return null;
  if(migration016) {
   const [summary,purchase]=await Promise.all([phoneSummary(tenantId),authorizeUsage(tenantId,'number_purchase')]);
   check('purchaseEntitlement',purchase.reason??'Workspace plan and purchase controls allow activation',purchase.allowed);
   check('phoneEntitlement',summary.phoneReadinessReason??'Workspace plan and phone controls allow incoming calls',summary.phoneReadinessReason===null);
   check('approval','Workspace phone approval granted',summary.phoneActivationApproved);
   check('browserTest','Workspace browser voice test recorded',summary.browserTestCompleted);
   check('account','Workspace provider account active',summary.account?.status==='active');
   check('kyc','Last observed provider KYC gate permits calls',summary.account?.callsBlocked===false);
   check('ai','Workspace AI configuration usable',summary.assistantConfigured);
   check('credit','Workspace has available testing credit',summary.wallet.status==='active'&&summary.wallet.availableMinor>0);
  }
 }
 let bridge:{status:string;commit:string|null;phoneSetupVersion:number|null}={status:'not_checked',commit:null,phoneSetupVersion:null};
 if(probeBridge&&bridgeUrl) {
  try {
   const response=await fetch(new URL('/health',bridgeUrl),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
   const data=await response.json();
   const commit=data.release?.commit;
   bridge={status:response.ok&&data.ok===true?'reachable':'unavailable',
    commit:typeof commit==='string'&&/^[a-f0-9]{7,40}$/i.test(commit)?commit:null,
    phoneSetupVersion:data.release?.phoneSetupVersion===1?1:null};
  }catch{bridge.status='unavailable';}
 }
 return {release:releaseInfo(),checks,bridge,liveProviderAcceptance:'NOT_VALIDATED',
  note:'Configuration and stored state only. Bridge signature readiness, secret alignment, actual funding, live KYC and carrier acceptance require separate verification.'};
}
