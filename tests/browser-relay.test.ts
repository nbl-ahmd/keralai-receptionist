import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserSession} from '../bridge/browser-session.mjs';
// Pure transport fixture: no network connection, DB write, key or paid model call.
test('browser relay emits tenant-local fixture transcription/audio and clears on interruption',async()=>{
 const frames:any[]=[];
 const socket={readyState:1,send:(value:string)=>frames.push(JSON.parse(value))};
 let completions=0;
 const session=new BrowserSession(socket as any,{tenantId:'fixture-tenant-a',ai:{} as any,liveModel:'fixture',embeddingModel:'fixture',companyProfile:{},buildInstruction:()=>'',buildTools:()=>[],buildGreeting:()=>'',onBrowserTestComplete:async()=>{completions++;}} as any);
 await session.handleGeminiMessage({setupComplete:{}});assert.equal(completions,0,'model setup alone is not a browser test');
 const payload=Buffer.alloc(48).toString('base64');
 await session.handleGeminiMessage({serverContent:{inputTranscription:{text:'Tenant A question'},outputTranscription:{text:'Fixture response'},modelTurn:{parts:[{inlineData:{data:payload,mimeType:'audio/pcm;rate=24000'}}]}}});
 assert.ok(frames.some(f=>f.type==='transcript'&&f.text==='Fixture response'));
 assert.ok(frames.some(f=>f.type==='audio'&&f.data===payload));
 assert.equal(completions,1);
 await session.handleGeminiMessage({serverContent:{modelTurn:{parts:[{inlineData:{data:payload}}]}}});assert.equal(completions,1,'completion recorded once');
 await session.handleGeminiMessage({serverContent:{interrupted:true}});
 assert.ok(frames.some(f=>f.type==='interrupted'));
 assert.equal(session.tenantId,'fixture-tenant-a');
});
