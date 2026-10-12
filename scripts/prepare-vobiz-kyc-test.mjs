// Operator-only disposable provider preparation. No DID, real identity or call.
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import nextEnv from '@next/env';
import {Pool} from 'pg';
const file='.test-output/vobiz-kyc-test-intent.json';
const create=process.argv.includes('--create'),retry=process.argv.includes('--retry-prepared'),test=process.argv.includes('--test-prepared')||retry;
if(create===test || (create && process.env.VOBIZ_KYC_TEST_CREATE_APPROVED!=='1') || (retry&&process.env.VOBIZ_KYC_TEST_RETRY_APPROVED!=='1')) {
 console.error('Choose --create with explicit VOBIZ_KYC_TEST_CREATE_APPROVED=1, --test-prepared, or --retry-prepared with VOBIZ_KYC_TEST_RETRY_APPROVED=1. No provider request made.');
 process.exit(1);
}
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
async function request(path,body) {
 const response=await fetch('https://api.vobiz.ai/api/v1'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
 headers:{'X-Auth-ID':process.env.VOBIZ_AUTH_ID,'X-Auth-Token':process.env.VOBIZ_AUTH_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new PreparationError(`Provider HTTP ${response.status}; payload suppressed`);
 return response.json();
}
class PreparationError extends Error {}
let pool;
try {
 if(!process.env.VOBIZ_AUTH_ID || !process.env.VOBIZ_AUTH_TOKEN)throw new PreparationError('Parent credentials required');
 if(create) {
  if(fs.existsSync(file))throw new PreparationError('A preparation intent exists. Reconcile it; never blindly create another account.');
  const actors=(process.env.PLATFORM_ADMIN_USER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,query_timeout:10000});
  const rows=(await pool.query('select email from "user" where id=any($1::text[])',[actors])).rows;
  if(rows.length!==1)throw new PreparationError('Exactly one configured existing operator is required');
  const alias=process.env.VOBIZ_KYC_TEST_EMAIL_ALIAS;
  if(alias&&!/^[a-z0-9-]{1,60}$/.test(alias))throw new PreparationError('Invalid disposable email alias');
  const [local,domain]=rows[0].email.split('@');
  const email=alias?`${local}+${alias}@${domain}`:rows[0].email;
  fs.mkdirSync('.test-output',{recursive:true});
  const record={purpose:'disposable_mock_kyc_only',state:'creating',createdAt:new Date().toISOString()};
  fs.writeFileSync(file,JSON.stringify(record),{flag:'wx',mode:0o600});
  const data=await request(`/accounts/${encodeURIComponent(process.env.VOBIZ_AUTH_ID)}/sub-accounts/`,{
   name:'KeralAI disposable mock KYC',email,kyc_mode:'customer_use',business_type:'individual',enabled:true,permissions:{calls:false,cdr:true}});
  const id=data.auth_credentials?.auth_id??data.sub_account?.auth_id;
  if(typeof id!=='string'||!id.startsWith('SA_'))throw new PreparationError('Created account identity needs read-only operator recovery');
  // Tokens and email are discarded. Only the disposable identifier is retained.
  fs.writeFileSync(file,JSON.stringify({...record,state:'created',authId:id}),{mode:0o600});
  console.log(JSON.stringify({action:'disposable_account_created',record:file,credentialsRetained:false,phoneNumbersAttached:0,kycTestRun:false}));
 } else {
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  if(record.purpose!=='disposable_mock_kyc_only'||!(retry?['blocked_contract_mismatch','test_failed']:['created']).includes(record.state)||!record.authId?.startsWith('SA_')||!Number.isFinite(Date.parse(record.createdAt))||Date.parse(record.createdAt)>Date.now()+60000||(!retry&&Date.now()-Date.parse(record.createdAt)>86400000))
   throw new PreparationError('A fresh, successfully created disposable preparation record is required');
  fs.writeFileSync(file,JSON.stringify({...record,state:'testing'}),{mode:0o600});
  const child=spawn(process.execPath,['scripts/test-vobiz-kyc.mjs'],{stdio:'inherit',env:{...process.env,VOBIZ_KYC_TEST_DISPOSABLE:'1',VOBIZ_KYC_TEST_SUBACCOUNT:record.authId}});
  const code=await new Promise(resolve=>child.on('exit',resolve));
  process.exitCode=code??1;
  const resultFile='.test-output/vobiz-kyc-test-result.json';
  const result=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile,'utf8')):{};
  fs.writeFileSync(file,JSON.stringify({...record,state:code===0?'tested':result.state==='blocked_contract_mismatch'?'blocked_contract_mismatch':'test_failed',testedAt:new Date().toISOString()}),{mode:0o600});
 }
} catch(error) {
 // Local messages above contain no provider body, credential or identity.
 console.error(error instanceof PreparationError?error.message:'Disposable preparation failed; reconcile existing intent');process.exitCode=1;
} finally {if(pool)await pool.end();}
