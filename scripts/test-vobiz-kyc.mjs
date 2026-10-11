// Explicit operator-run contract test. Only a NEW disposable customer_use individual account.
// Test endpoints persist real provider KYC rows. Never point this at a customer.
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const id=process.env.VOBIZ_KYC_TEST_SUBACCOUNT;
if(process.env.VOBIZ_KYC_TEST_DISPOSABLE!=='1' || !id?.startsWith('SA_'))throw new Error('Set VOBIZ_KYC_TEST_DISPOSABLE=1 and VOBIZ_KYC_TEST_SUBACCOUNT to a new throwaway SA account');
if(!process.env.VOBIZ_AUTH_ID || !process.env.VOBIZ_AUTH_TOKEN)throw new Error('Platform Vobiz credentials required');
async function request(path,body){
 const response=await fetch('https://api.vobiz.ai/api/v1'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'X-Auth-ID':process.env.VOBIZ_AUTH_ID,'X-Auth-Token':process.env.VOBIZ_AUTH_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new Error(`Provider contract test failed (HTTP ${response.status}); payload suppressed`);
 return response.json();
}
const state=()=>request(`/sub-accounts/${encodeURIComponent(id)}/kyc/status`);
const mock=(path,body)=>request(`/sub-accounts/test/${encodeURIComponent(id)}/kyc/${path}`,body);
let status=await state();assert.equal(status.sub_account_id,id);assert.equal(status.kyc_mode,'customer_use');assert.equal(status.business_type,'individual');assert.equal(status.overall_status,'not_started');assert.equal(status.kyc_calls_blocked,true);
for(const [pan,expected] of [['TESTFAIL0001','failed'],['TESTPENDING001','pending'],['TESTSUCCESS0001','verified']]){
 const response=await mock('verify-pan',{pan});assert.equal(response.mock,true);assert.equal(response.status,expected);
 status=await state();assert.equal(status.verifications.pan,expected);assert.equal(status.kyc_calls_blocked,true,'PAN alone must not unlock individual calls');
 if(expected==='pending'){
  await mock('finalize-pending',{verification_type:'pan',outcome:'failed'});
  status=await state();assert.equal(status.verifications.pan,'failed');assert.equal(status.kyc_calls_blocked,true);
 }
}
await mock('digilocker/verify',{access_request_id:'MOCK_AR_SUCCESS'});
status=await state();assert.equal(status.verifications.aadhaar,'verified');assert.equal(status.overall_status,'verified');assert.equal(status.kyc_calls_blocked,false);
console.log('Vobiz KYC contract: not_started, failed, pending, verified and individual call gate passed. Disposable account must never be assigned a production number.');
