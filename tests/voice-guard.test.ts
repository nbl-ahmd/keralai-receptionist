import test from 'node:test';
import assert from 'node:assert/strict';
import {installVoiceGuard} from '../bridge/voice-guard.mjs';
test('bridge guard terminates at duration and on rolling revocation without provider calls',async()=>{
 const results:string[]=[];
 const cancel=installVoiceGuard({expiresAt:Date.now()+25,check:async()=>({allowed:true}),end:(reason:string)=>results.push(reason),intervalMs:10});
 await new Promise(r=>setTimeout(r,50));cancel();assert.deepEqual(results,['max_duration']);
 results.length=0;const cancel2=installVoiceGuard({expiresAt:Date.now()+1000,check:async()=>({allowed:false}),end:(reason:string)=>results.push(reason),intervalMs:10});
 await new Promise(r=>setTimeout(r,30));cancel2();assert.deepEqual(results,['authorization_revoked']);
});
