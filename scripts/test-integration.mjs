// Isolated ephemeral schema. Never write test fixtures into the application schema.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {Pool} from 'pg';
import nextEnv from '@next/env';
const {loadEnvConfig}=nextEnv;
loadEnvConfig(process.cwd());
const liveGemini=process.argv.includes('--live-gemini');
if(liveGemini && (process.env.ALPHA_LIVE_GEMINI_APPROVED!=='1' || !process.env.PLATFORM_GEMINI_API_KEY?.trim()))
 throw new Error('Live Gemini requires explicit approval and a server-side managed key');
const base=process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if(!base)throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
const schema=`keralai_test_${crypto.randomBytes(8).toString('hex')}`;
const directUrl=new URL(base);directUrl.hostname=directUrl.hostname.replace('-pooler.','.');
const pool=new Pool({connectionString:directUrl.href,max:1});
let code=1;
try {
 await pool.query(`create schema ${schema}`);
 const client=await pool.connect();
 try {
  await client.query(`set search_path to ${schema},public`);
  for(const file of fs.readdirSync('db/migrations').filter(x=>x.endsWith('.sql')).sort()){
   await client.query('begin');try {await client.query(fs.readFileSync(`db/migrations/${file}`,'utf8'));await client.query('commit');} catch(error) {await client.query('rollback');throw Object.assign(error,{migration:file});}
  }
  await client.query('update platform_usage_controls set phone_enabled=true,purchase_enabled=true where id=1');
 }finally{client.release();}
 const url=new URL(base);url.hostname=url.hostname.replace('-pooler.','.');url.searchParams.set('options',`-csearch_path=${schema},public`);
 const env={...process.env,AI_ENVIRONMENT:'development',PLATFORM_BROWSER_VOICE_ENABLED:'1',PLATFORM_NEW_PHONE_CALLS_ENABLED:'1',PLATFORM_NUMBER_PURCHASE_ENABLED:'1',PLATFORM_GEMINI_API_KEY:'',BETTER_AUTH_URL:'https://app.example',NEXT_PUBLIC_APP_URL:'https://app.example',PUBLIC_APP_ORIGIN:'https://app.example',BETTER_AUTH_SECRET:crypto.randomBytes(32).toString('base64'),DATABASE_URL:url.href,TEST_SCHEMA:schema,KERALAI_TEST_SCHEMA:schema,BRIDGE_AUTH_SECRET:'integration-test-bridge-secret',TENANT_SECRETS_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),VOBIZ_CALLBACK_SIGNATURES_VERIFIED:'1',VOBIZ_AUTH_ID:'MA_TEST',VOBIZ_AUTH_TOKEN:'parent-test-secret',TELEPHONY_PUBLIC_ORIGIN:'https://app.example',BRIDGE_PUBLIC_URL:'https://bridge.example',ALPHA_MAX_DID_SETUP_COST_MINOR:'1000',ALPHA_MAX_DID_MONTHLY_COST_MINOR:'10000',ALPHA_DID_RELEASE_COST_MINOR:'0',ALPHA_MAX_DID_RELEASE_COST_MINOR:'0',ALPHA_MAX_DID_COMMITMENT_MONTHS:'0',ALPHA_MIN_VOBIZ_BALANCE_MINOR:'10000',PHONE_MONTHLY_PRICE_MINOR:'10000',PHONE_SETUP_PRICE_MINOR:'1000',CALL_PRICE_PER_MINUTE_MINOR:'100',PROVIDER_VOICE_RESERVE_MINOR_PER_MINUTE:'100',AI_VOICE_ESTIMATE_MINOR_PER_MINUTE:'100'};
 // Never inherit a real VoiceLink credential into mocked/local integration tests.
 env.VOICELINK_AUTH_TOKEN='';
 if(liveGemini) {
  // Only ephemeral data and real Gemini. Vobiz mutations remain impossible.
  Object.assign(env,{AI_ENVIRONMENT:'alpha',PLATFORM_GEMINI_API_KEY:process.env.PLATFORM_GEMINI_API_KEY,
   BETTER_AUTH_URL:'http://localhost:3212',NEXT_PUBLIC_APP_URL:'http://localhost:3212',PUBLIC_APP_ORIGIN:'http://localhost:3212',
   PUBLIC_BRIDGE_WS_URL:'ws://localhost:3213',PORT:'3213',NODE_ENV:'production',
   PLATFORM_NEW_PHONE_CALLS_ENABLED:'0',PLATFORM_NUMBER_PURCHASE_ENABLED:'0',VOBIZ_CALLBACK_SIGNATURES_VERIFIED:'0',
   VOBIZ_AUTH_ID:'',VOBIZ_AUTH_TOKEN:'',METRICS_TOKEN:'live-smoke-fixture-metrics'});
  await pool.query(`update ${schema}.platform_usage_controls set phone_enabled=false,purchase_enabled=false,monthly_ai_cap_minor=50000 where id=1`);
  await pool.query(`update ${schema}.plans set entitlements=entitlements||'{"max_session_seconds":45,"monthly_ai_budget_minor":50000}'::jsonb where code='alpha'`);
  const services=[spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3212'],{env,stdio:'inherit'}),
   spawn(process.execPath,['bridge/server.mjs'],{env,stdio:'inherit'})];
  try {
   for(const health of ['http://localhost:3212/api/health','http://localhost:3213/health']) {
    let ready=false;
    for(let attempt=0;attempt<30;attempt++) {
     try{if((await fetch(health,{signal:AbortSignal.timeout(1000)})).ok){ready=true;break;}}catch{}
     await new Promise(resolve=>setTimeout(resolve,1000));
    }
    if(!ready)throw new Error('Live smoke service did not start');
   }
   const child=spawn(process.execPath,['scripts/live-gemini-browser.mjs'],{env,stdio:'inherit'});
   code=await new Promise(resolve=>child.on('exit',resolve));
  } finally {
   await Promise.all(services.map(service=>new Promise(resolve=>{
    if(service.exitCode!==null||service.signalCode!==null)return resolve();
    service.once('exit',resolve);service.kill('SIGTERM');
   })));
  }
 } else if(process.argv.includes('--ui')) {
  Object.assign(env,{BETTER_AUTH_URL:'http://localhost:3210',NEXT_PUBLIC_APP_URL:'http://localhost:3210',PUBLIC_APP_ORIGIN:'http://localhost:3210'});
  const operator=spawn(process.execPath,['--import','tsx','scripts/seed-ui-admin.ts'],{env,stdio:['ignore','pipe','inherit']});
  let operatorId='';operator.stdout.on('data',chunk=>{operatorId+=chunk.toString();});
  if(await new Promise(resolve=>operator.on('exit',resolve))!==0 || !operatorId.trim())throw new Error('Admin UI fixture failed');
  env.PLATFORM_ADMIN_USER_IDS=operatorId.trim();
  const {createServer}=await import('node:net');
  const portCheck=createServer();
  await new Promise((resolve,reject)=>{portCheck.once('error',reject);portCheck.listen(3210,()=>portCheck.close(resolve));});
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3210'],{env,stdio:'inherit'});
  try {
   let ready=false;
   for(let attempt=0;attempt<30;attempt++) {
    try{if((await fetch('http://localhost:3210/api/health')).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
   }
   if(!ready)throw new Error('UI server did not start');
   const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(process.argv.indexOf('--ui')+1)],{env,stdio:'inherit'});
   code=await new Promise(resolve=>child.on('exit',resolve));
  }finally{if(server.exitCode===null && server.signalCode===null){server.kill('SIGTERM');await new Promise(resolve=>server.on('exit',resolve));}}
 }else {
  const child=spawn(process.execPath,['--import','tsx','--test','--test-concurrency=1',...(process.argv.includes('--voicelink')?['tests/voicelink.integration.ts']:process.argv.includes('--exposure')?['tests/did-exposure.integration.ts']:process.argv.includes('--alpha')?['tests/alpha.integration.ts']:process.argv.includes('--telephony')?['tests/telephony.integration.ts','tests/voicelink.integration.ts']:['tests/telephony.integration.ts','tests/alpha.integration.ts','tests/voicelink.integration.ts'])],{env,stdio:'inherit'});
  code=await new Promise(resolve=>child.on('exit',resolve));
 }
}finally{
 await pool.query('reset search_path');
 await pool.query(`drop schema if exists ${schema} cascade`);await pool.end();
}
process.exit(code??1);
