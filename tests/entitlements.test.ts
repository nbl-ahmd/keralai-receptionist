import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedLimits,hashSessionToken} from '../bridge/entitlements.mjs';
test('entitlement configuration and token hashing fail closed',()=>{
 assert.throws(()=>validatedLimits({}),/invalid/);
 const limits=Object.fromEntries(['phone_concurrency','browser_concurrency','max_session_seconds','phone_minutes','browser_seconds','browser_daily_seconds','monthly_spend_minor','monthly_ai_budget_minor','ai_reserve_minor','knowledge_items'].map(k=>[k,1]));
 assert.equal(validatedLimits(limits).phone_concurrency,1);
 assert.throws(()=>validatedLimits({...limits,max_session_seconds:901}),/duration/);
 assert.throws(()=>validatedLimits({...limits,phone_minutes:-1}),/invalid/);
 assert.equal(hashSessionToken('raw').length,64);assert.notEqual(hashSessionToken('a'),hashSessionToken('b'));
});
