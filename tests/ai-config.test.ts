import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTenantAiConfiguration} from '../bridge/ai-config.mjs';
test('canonical AI selection preserves BYOK, managed models and missing-key fail-closed behavior',async()=>{
 const old=process.env.PLATFORM_GEMINI_API_KEY;process.env.PLATFORM_GEMINI_API_KEY='fixture-platform';
 try {
  let mode='platform_managed';let active=true;let secretReads=0;
  const query=async(sql:string)=>sql.includes('tenant_ai_configuration')?[{credential_mode:mode,status:active?'active':'suspended'}]:sql.includes('tenant_subscriptions')?[{status:'active',active:true}]:[];
  const readSecret=async()=>{secretReads++;return 'fixture-personal';};
  assert.equal((await resolveTenantAiConfiguration('a',{query,readSecret})).apiKey,'fixture-platform');assert.equal(secretReads,0);
  mode='tenant_managed';assert.equal((await resolveTenantAiConfiguration('a',{query,readSecret})).apiKey,'fixture-personal');
  mode='platform_managed';process.env.PLATFORM_GEMINI_API_KEY='';
  assert.equal((await resolveTenantAiConfiguration('a',{query,readSecret})).apiKey,null);
  await assert.rejects(resolveTenantAiConfiguration('a',{query,readSecret,consume:true}),/not configured/);
  assert.equal(secretReads,1);active=false;await assert.rejects(resolveTenantAiConfiguration('a',{query,readSecret}),/unavailable/);
 }finally{if(old===undefined)delete process.env.PLATFORM_GEMINI_API_KEY;else process.env.PLATFORM_GEMINI_API_KEY=old;}
});
