import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderError,providerErrorDetails} from '@/lib/telephony/errors';
import {request} from '@/lib/telephony/providers/vobiz/client';
import {kycTestClient,KycContractError} from '../scripts/vobiz-kyc-client.mjs';
test('provider failures classify the operation without leaking account paths or bodies',async()=>{
 const original=globalThis.fetch;
 Object.assign(process.env,{VOBIZ_AUTH_ID:'MA_fixture',VOBIZ_AUTH_TOKEN:'private-token'});
 globalThis.fetch=async()=>new Response(JSON.stringify({pan:'private-pan',token:'private-token'}),{status:404});
 try {
  await assert.rejects(request('/sub-accounts/SA_private/kyc-sessions',{method:'POST',body:{account_auth_id:'SA_private'}}),error=>{
   assert.ok(error instanceof ProviderError);assert.equal(error.status,503);
   assert.deepEqual(providerErrorDetails(error),{providerCode:'http_404',providerStatus:404,operation:'kyc_session',uncertain:false});
   assert.ok(!JSON.stringify(error).includes('SA_private'));return true;
  });
  const details=providerErrorDetails(new ProviderError('private-token',false,401,'SA_private'));
  assert.equal(details.providerCode,'provider_failed');assert.equal(details.operation,'provider_request');
 }finally{globalThis.fetch=original;}
});
test('synthetic KYC 404 stops on the documented route with safe evidence and no fallback',async()=>{
 const paths:string[]=[];
 const env={VOBIZ_KYC_TEST_DISPOSABLE:'1',VOBIZ_KYC_TEST_SUBACCOUNT:'SA_private',VOBIZ_AUTH_ID:'MA_fixture',VOBIZ_AUTH_TOKEN:'private-token'};
 const client=kycTestClient(env,async(url)=>{
  paths.push(String(url));return new Response('private-provider-body',{status:404,headers:{'x-request-id':'12345678-abcd'}});
 });
 await assert.rejects(client.mock('verify-pan',{pan:'TESTSUCCESS0001'}),error=>{
  assert.ok(error instanceof KycContractError);assert.equal(error.status,404);assert.equal(error.operation,'verify-pan');
  assert.equal(error.requestId,'12345678-abcd');assert.ok(!JSON.stringify(error).includes('private'));return true;
 });
 assert.deepEqual(paths,['https://api.vobiz.ai/api/v1/sub-accounts/test/SA_private/kyc/verify-pan']);
 assert.throws(()=>client.mock('kyc-sessions',{}));assert.equal(paths.length,1);
 assert.throws(()=>kycTestClient({...env,VOBIZ_KYC_TEST_DISPOSABLE:'0'}));
});
