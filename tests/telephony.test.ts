import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { assertActivationAllowed,normalizeE164,callCharge } from '../lib/telephony/policy';
import { createPhoneBridgeToken,verifyBridgeToken,createBrowserBridgeToken } from '../lib/tenant/bridge-token';
import { verifyVoiceWebhook,verifyKycWebhook } from '../lib/telephony/providers/vobiz/webhooks';
import { streamXml } from '../lib/telephony/providers/vobiz/xml';
import { decodeMuLaw,encodeMuLaw } from '../bridge/transports/audio.mjs';
import { ExotelTransport } from '../bridge/transports/exotel-legacy.mjs';
import { VobizTransport } from '../bridge/transports/vobiz.mjs';
import { verifyBridgeToken as verifyBridge } from '../bridge/bridge-token.mjs';
process.env.BRIDGE_AUTH_SECRET='unit-test-bridge-secret';
process.env.VOBIZ_AUTH_ID='MA_TEST';process.env.VOBIZ_AUTH_TOKEN='unit-test-parent-token';

test('KYC provider gate fails closed in all blocked states, even verified',()=>{
 for(const status of ['not_started','pending','failed','verified'])assert.throws(()=>assertActivationAllowed({status:'active',kyc_calls_blocked:true}));
 assert.doesNotThrow(()=>assertActivationAllowed({status:'active',kyc_calls_blocked:false}));
 assert.throws(()=>assertActivationAllowed({status:'suspended',kyc_calls_blocked:false}));
 assert.throws(()=>assertActivationAllowed(null));
});
test('E.164 and integer call billing preserve country codes and rounding',()=>{
 assert.equal(normalizeE164('918065551234'),'+918065551234');assert.equal(normalizeE164('+91 8065-551234'),'+918065551234');
 assert.throws(()=>normalizeE164('sip:evil@example.com'));assert.throws(()=>normalizeE164('123'));
 assert.equal(callCharge(0,123),0);assert.equal(callCharge(1,123),123);assert.equal(callCharge(61,123),246);assert.throws(()=>callCharge(-1,123));
});
test('phone tokens are short-lived, scope-bound and compatible with bridge verification',()=>{
 const token=createPhoneBridgeToken({tenantId:'tenant-A',phoneNumberId:'number-A',providerCallId:'call-A'});
 const result=verifyBridge(token,'phone');assert.ok(result.ok);assert.equal(result.payload.tid,'tenant-A');assert.equal(result.payload.provider_call_id,'call-A');
 assert.equal(verifyBridgeToken(token+'.extra','phone').ok,false);assert.equal(verifyBridge(token+'.extra','phone').ok,false);
 assert.equal(verifyBridgeToken(token,'browser').ok,false);assert.equal(verifyBridge(token+'tamper','phone').ok,false);
 const browser=createBrowserBridgeToken({tenantId:'A',userId:'user-A'},-1);assert.equal(verifyBridge(browser.token,'browser').ok,false);
});
test('KYC HMAC authenticates exact raw body; voice uses URL+nonce contract',()=>{
 const body='{"event":"kyc.completed"}';
 const headers=new Headers({'X-Vobiz-Signature':'sha256='+crypto.createHmac('sha256',process.env.VOBIZ_AUTH_TOKEN!).update(body).digest('hex')});
 assert.equal(verifyKycWebhook({rawBody:body,headers}),true);assert.equal(verifyKycWebhook({rawBody:body+' ',headers}),false);
 const url='https://app.example/api/telephony/vobiz/answer',nonce='random-nonce';
 const signature=crypto.createHmac('sha256',process.env.VOBIZ_AUTH_TOKEN!).update(url+'.'+nonce).digest('base64');
 const voice=new Headers({'X-Vobiz-Signature-MA-V3':signature,'X-Vobiz-Signature-V3-Nonce':nonce});
 assert.equal(verifyVoiceWebhook({url,headers:voice}),nonce);assert.equal(verifyVoiceWebhook({url:url+'-evil',headers:voice}),null);
 assert.equal(verifyVoiceWebhook({url,headers:new Headers()}),null);
});
test('XML keeps call alive, uses mu-law, escapes query characters and disallows insecure media',()=>{
 const xml=streamXml('wss://bridge.example/ws/vobiz?token=a&x=b');assert.match(xml,/keepCallAlive="true"/);assert.match(xml,/audio\/x-mulaw;rate=8000/);assert.match(xml,/&amp;x=b/);
 assert.throws(()=>streamXml('ws://localhost/media'));
});
test('G.711 known vectors and roundtrip avoid pitch and byte-order corruption',()=>{
 assert.equal(decodeMuLaw(Buffer.from([255,127])).readInt16LE(0),0);assert.equal(decodeMuLaw(Buffer.from([0])).readInt16LE(0),-32124);
 assert.equal(decodeMuLaw(Buffer.from([128])).readInt16LE(0),32124);
 const pcm=Buffer.alloc(160*2);for(let i=0;i<160;i++)pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI/40)*12000),i*2);
 const encoded=encodeMuLaw(pcm);assert.equal(encoded.length,160);const decoded=decodeMuLaw(encoded);assert.equal(decoded.length,320);
 for(let i=0;i<160;i++)assert.ok(Math.abs(decoded.readInt16LE(i*2)-pcm.readInt16LE(i*2))<600);
});
test('Vobiz transport checks signed call identity, frames playback, and clears on interruption',()=>{
 const sent:unknown[]=[];const ws={readyState:1,send:(x:string)=>sent.push(JSON.parse(x)),close:()=>{}};
 const t=new VobizTransport(ws,{provider_call_id:'call-A'});
 assert.throws(()=>t.normalize({event:'start',start:{callId:'call-B'}}));
 const frame=t.normalize({event:'start',start:{callId:'call-A',streamId:'stream-A',mediaFormat:{encoding:'audio/x-mulaw',sampleRate:8000}}});
 assert.equal(frame.start.call_sid,'vobiz:call-A');t.media(Buffer.alloc(640));t.clear();t.checkpoint();
 const messages=sent as Array<{event:string;media?:{payload:string};streamId?:string}>;
 assert.deepEqual(messages.map(x=>x.event),['playAudio','playAudio','clearAudio','checkpoint']);
 assert.equal(messages[0].streamId,'stream-A');assert.equal(Buffer.from(messages[0].media!.payload,'base64').length,160);assert.equal(messages[2].streamId,'stream-A');t.dispose();
});

test('deprecated Exotel adapter preserves PCM and existing stream-key commands',()=>{
 const sent:unknown[]=[];const ws={readyState:1,send:(x:string)=>sent.push(JSON.parse(x)),close:()=>{}};
 const transport=new ExotelTransport(ws),frame={event:'start',start:{call_sid:'legacy-call'}};
 assert.equal(transport.normalize(frame),frame);
 const pcm=Buffer.from([1,2,3,4]);assert.deepEqual(transport.decode(pcm.toString('base64')),pcm);
 transport.media(pcm,'legacy-stream','stream_sid');transport.clear('legacy-stream','streamSid');transport.checkpoint();
 assert.deepEqual(sent,[{event:'media',stream_sid:'legacy-stream',media:{payload:pcm.toString('base64')}},{event:'clear',streamSid:'legacy-stream'}]);
});
