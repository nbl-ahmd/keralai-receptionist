// Explicit operator-run contract test. Only a NEW disposable customer_use individual account.
// Test endpoints persist real provider KYC rows. Never point this at a customer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {kycTestClient,KycContractError} from './vobiz-kyc-client.mjs';
import nextEnv from '@next/env';
import {normalizeKycStatus} from '../lib/telephony/providers/vobiz/kyc-status.mjs';
nextEnv.loadEnvConfig(process.cwd());
const id=process.env.VOBIZ_KYC_TEST_SUBACCOUNT;
if(process.env.VOBIZ_KYC_TEST_DISPOSABLE!=='1' || !id?.startsWith('SA_'))throw new Error('Set VOBIZ_KYC_TEST_DISPOSABLE=1 and VOBIZ_KYC_TEST_SUBACCOUNT to a new throwaway SA account');
if(!process.env.VOBIZ_AUTH_ID || !process.env.VOBIZ_AUTH_TOKEN)throw new Error('Platform Vobiz credentials required');
const client=kycTestClient(process.env);
const state=async()=>{const raw=await client.status();const account='sub_account_id' in raw?undefined:await client.account();return normalizeKycStatus(raw,id,account,process.env.VOBIZ_AUTH_ID);};
const mock=client.mock;
const evidence='.test-output/vobiz-kyc-test-result.json';
fs.mkdirSync('.test-output',{recursive:true});
fs.rmSync(evidence,{force:true});
try {
let status=await state();assert.ok(['not_started','pending'].includes(status.status));assert.equal(status.callsBlocked,true);for(const doc of ['pan','aadhaar'])assert.ok(!status.documents[doc]||status.documents[doc]==='not_started');
for(const [pan,expected] of [['TESTFAIL0001','failed'],['TESTPENDING001','pending'],['TESTSUCCESS0001','verified']]){
 const response=await mock('verify-pan',{pan});assert.equal(response.mock,true);assert.equal(response.status,expected);
 status=await state();assert.equal(status.documents.pan,expected);assert.equal(status.callsBlocked,true,'PAN alone must not unlock individual calls');
 if(expected==='pending'){
  await mock('finalize-pending',{verification_type:'pan',outcome:'failed'});
  status=await state();assert.equal(status.documents.pan,'failed');assert.equal(status.callsBlocked,true);
 }
}
await mock('digilocker/verify',{access_request_id:'MOCK_AR_SUCCESS'});
status=await state();assert.equal(status.documents.aadhaar,'verified');assert.equal(status.status,'verified');assert.equal(status.callsBlocked,false);
console.log('Vobiz KYC contract: not_started, failed, pending, verified and individual call gate passed. Disposable account must never be assigned a production number.');
fs.writeFileSync(evidence,JSON.stringify({state:'passed',checkedAt:new Date().toISOString()}),{mode:0o600});
} catch(error) {
 const result={state:error instanceof KycContractError&&error.status===404?'blocked_contract_mismatch':'test_failed',
  checkedAt:new Date().toISOString(),...(error instanceof KycContractError?{operation:error.operation,httpStatus:error.status,requestId:error.requestId}:{kind:'state_assertion_failed'})};
 fs.writeFileSync(evidence,JSON.stringify(result),{mode:0o600});
 console.error(error instanceof KycContractError?error.message:'KYC state assertion failed; provider payload suppressed.');
 console.error(JSON.stringify({...result,evidence}));process.exitCode=1;
}
