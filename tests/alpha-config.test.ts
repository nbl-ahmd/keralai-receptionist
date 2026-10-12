import test from 'node:test';
import assert from 'node:assert/strict';
import {alphaConfiguration} from '../scripts/alpha-config.mjs';
test('readiness never treats a configured key as live acceptance and redacts mismatches',()=>{
 const app:any={DATABASE_URL:'postgresql://fixture/db',BRIDGE_AUTH_SECRET:'fixture-signing-secret',TENANT_SECRETS_ENCRYPTION_KEY:'fixture-encryption-secret',PLATFORM_GEMINI_API_KEY:'fixture-managed-key',BETTER_AUTH_SECRET:'x'.repeat(40),BETTER_AUTH_URL:'http://localhost:3000',NEXT_PUBLIC_APP_URL:'http://localhost:3000',PLATFORM_ADMIN_USER_IDS:'fixture-user',ALPHA_INVITE_ISSUANCE_ENABLED:'1',AI_ENVIRONMENT:'alpha',PLATFORM_BROWSER_VOICE_ENABLED:'1'};
 const bridge={...app,PUBLIC_APP_ORIGIN:'http://localhost:3000'};
 assert.deepEqual(alphaConfiguration(app,bridge).browserBlockers,[]);
 const result=alphaConfiguration(app,{...bridge,PLATFORM_GEMINI_API_KEY:'different-secret'});
 assert.equal(result.matches.PLATFORM_GEMINI_API_KEY,false);
 assert.ok(result.browserBlockers.length);
 assert.equal(result.liveGemini,'NOT_VALIDATED');assert.equal(result.livePhone,'NOT_VALIDATED');
 assert.ok(result.phoneBlockers.length);
 for(const value of ['fixture-managed-key','different-secret','fixture-signing-secret'])assert.ok(!JSON.stringify(result).includes(value));
 assert.ok(alphaConfiguration({...app,TEST_SCHEMA:'public'},bridge).browserBlockers.length);
});

test('phone readiness requires canonical HTTPS callbacks and matching secure bridge origins',()=>{
 const app:any={BETTER_AUTH_URL:'https://app.example.org',TELEPHONY_PUBLIC_ORIGIN:'https://app.example.org',BRIDGE_PUBLIC_URL:'https://bridge.example.org',NEXT_PUBLIC_BRIDGE_WS_URL:'wss://bridge.example.org'};
 const missing=alphaConfiguration({...app,TELEPHONY_PUBLIC_ORIGIN:undefined},{});assert.ok(missing.phoneBlockers.some(b=>b.startsWith('Telephony public origin:')));
 const valid=alphaConfiguration(app,{});assert.ok(!valid.phoneBlockers.some(b=>/origin|Bridge public URL|Browser bridge URL/.test(b)));
 for(const url of ['http://bridge.example.org','https://user:pass@bridge.example.org','https://bridge.example.org/path'])assert.ok(alphaConfiguration({...app,BRIDGE_PUBLIC_URL:url},{}).phoneBlockers.some(b=>b.startsWith('Bridge public URL:')));
 assert.ok(alphaConfiguration({...app,NEXT_PUBLIC_BRIDGE_WS_URL:'wss://other.example.org'},{}).phoneBlockers.some(b=>b.startsWith('Browser bridge URL:')));
});
