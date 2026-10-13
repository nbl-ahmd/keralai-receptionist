// Read-only bridge control smoke: no authenticated session, AI or provider call.
import nextEnv from '@next/env';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import WebSocket from 'ws';
import {safeError} from '../bridge/safe-error.mjs';

nextEnv.loadEnvConfig(process.cwd());
const probe=createServer();
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const child=spawn(process.execPath,['bridge/server.mjs'],{stdio:'ignore',env:{
 ...process.env,NODE_ENV:'production',PORT:String(port),
 DATABASE_URL:process.env.TEST_DATABASE_URL??process.env.DATABASE_URL,
 BRIDGE_AUTH_SECRET:randomBytes(32).toString('base64'),
 TENANT_SECRETS_ENCRYPTION_KEY:randomBytes(32).toString('base64'),
 PUBLIC_APP_ORIGIN:'https://smoke.invalid',
 PLATFORM_BROWSER_VOICE_ENABLED:'0',PLATFORM_NEW_PHONE_CALLS_ENABLED:'0',
 PLATFORM_NUMBER_PURCHASE_ENABLED:'0',VOBIZ_CALLBACK_SIGNATURES_VERIFIED:'0',
 LEGACY_GEMINI_API_KEY:'',GEMINI_API_KEY:'',PLATFORM_GEMINI_API_KEY:'',VOBIZ_AUTH_ID:'',VOBIZ_AUTH_TOKEN:'',
}});
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
try {
 let healthy=false;
 for(let attempt=0;attempt<80;attempt++) {
  if(child.exitCode!==null||child.signalCode!==null)break;
  try{if((await fetch(`http://127.0.0.1:${port}/health`,{signal:AbortSignal.timeout(1000)})).ok){healthy=true;break;}}catch{}
  await delay(250);
 }
 if(!healthy)throw new Error('Bridge did not start');
 const rejected=path=>new Promise((resolve,reject)=>{
  const ws=new WebSocket(`ws://127.0.0.1:${port}${path}?token=invalid`);
  const timer=setTimeout(()=>{ws.terminate();reject(new Error('Phone rejection timed out'));},5000);
  ws.on('unexpected-response',(_,response)=>{response.resume();clearTimeout(timer);resolve(response.statusCode);});
  ws.on('open',()=>{clearTimeout(timer);ws.close();reject(new Error('Unauthorized phone admitted'));});
  ws.on('error',()=>{});
 });
 const status=await rejected('/ws/vobiz');
 const voiceLinkStatus=await rejected('/ws/voicelink');
 if(voiceLinkStatus!==404)throw new Error('Unverified VoiceLink path was mounted');
 if(status!==401)throw new Error('Phone did not reject invalid token');
 console.log(JSON.stringify({check:'bridge_health',status:200,unauthorizedPhoneStatus:status,unmountedVoiceLinkStatus:voiceLinkStatus,providerCalls:'NOT_RUN'}));
 child.kill('SIGTERM');
 let timer;
 const result=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Shutdown timed out')),12000);})]).finally(()=>clearTimeout(timer));
 if(result.code!==0)throw new Error('Shutdown failed');
 console.log(JSON.stringify({check:'bridge_graceful_shutdown',...result}));
}catch(error){console.error(JSON.stringify({check:'bridge_smoke_failed',...safeError(error)}));process.exitCode=1;}
finally{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await exited;}}
