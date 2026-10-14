import test from 'node:test';
import assert from 'node:assert/strict';
import { safeKyc } from '../lib/telephony/providers/voicelink/schemas';
import { managedKycState, kycRedirect, documentType, kycTermsUrl } from '../lib/telephony/providers/voicelink/kyc';
import { VoiceLinkClient } from '../lib/telephony/providers/voicelink/client';
import { GET as kycReturn } from '../app/api/telephony/voicelink/kyc/return/route';
const raw={account_type:'individual',is_complete:false,pan_verified:true,aadhaar_verified:false,kyc_status:0,current_step:'pan',
 pan_number:'PRIVATE_PAN',documents:{pan:{uploaded:true,url:'https://private.example/document',document_number:'PRIVATE_PAN',file_name:'private-name.pdf'}}};
test('managed KYC returns progress without identity numbers, URLs, names or documents',()=>{
 const state=managedKycState(raw);assert.equal(state.documents.pan.uploaded,true);assert.equal(state.readyForSubmission,false);
 assert.ok(!JSON.stringify(state).includes('PRIVATE'));assert.ok(!JSON.stringify(state).includes('private'));
 assert.equal(managedKycState({...raw,account_type:'business',gst_verified:false}).readyForSubmission,false);
});
test('DigiLocker redirects reject arbitrary origins, credentials, ports and insecure protocols',()=>{
 assert.equal(kycRedirect('https://digilocker.gov.in/verify?state=fixture'),'https://digilocker.gov.in/verify?state=fixture');
 for(const url of ['https://evil.test','https://digilocker.gov.in.evil.test','http://digilocker.gov.in','https://user:pass@digilocker.gov.in','https://digilocker.gov.in:8443'])assert.throws(()=>kycRedirect(url));
});
test('uploads use scoped multipart and never expose the reseller token',async()=>{
 const data=new FormData();data.set('client_id','101');data.set('document_type','pan');data.set('document',new File(['%PDF-1.7\nfixture'],'pan.pdf',{type:'application/pdf'}));
 const client=new VoiceLinkClient('fixture-token',async(url,init)=>{
  assert.equal(String(url),'https://app.voicelink.co.in/api/v1/reseller/kyc/upload-document');
  assert.equal(new Headers(init?.headers).has('Content-Type'),false);assert.equal(init?.body,data);
  return Response.json({status:true,data:{document_id:1}});
 });
 await client.request('/reseller/kyc/upload-document',{method:'POST',body:data});
 assert.throws(()=>documentType(new File(['<html>bad'],'pan.svg',{type:'image/svg+xml'})));
});
test('KYC return ignores forged status and sensitive query parameters',()=>{
 const response=kycReturn(new Request('https://app.example/api/telephony/voicelink/kyc/return?status=verified&pan=private&redirect=https://evil.test'));
 assert.equal(response.status,303);assert.match(response.headers.get('location')!,/\/dashboard\/phone\?provider=voicelink$/);
 assert.ok(!response.headers.get('location')!.includes('private'));assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});

test('observed null account type before registration stays not started and blocked',()=>{
 const initial={...raw,account_type:null,pan_verified:false,aadhaar_verified:false,current_step:'register'};
 assert.equal(safeKyc(initial).status,'not_started');assert.equal(safeKyc(initial).callsBlocked,true);
 assert.equal(managedKycState(initial).step,'register');
 assert.throws(()=>safeKyc({...initial,pan_verified:true}));
});

test('verification consent only links provider-hosted HTTPS terms',()=>{
 const original=process.env.VOICELINK_KYC_TERMS_URL;
 try {
  delete process.env.VOICELINK_KYC_TERMS_URL;assert.equal(kycTermsUrl(),null);
  for(const value of ['http://app.voicelink.co.in/terms','https://evil.test/terms','https://user:password@app.voicelink.co.in/terms']){
   process.env.VOICELINK_KYC_TERMS_URL=value;assert.equal(kycTermsUrl(),null);
  }
  process.env.VOICELINK_KYC_TERMS_URL='https://app.voicelink.co.in/fixture-terms';assert.equal(kycTermsUrl(),process.env.VOICELINK_KYC_TERMS_URL);
 }finally{if(original===undefined)delete process.env.VOICELINK_KYC_TERMS_URL;else process.env.VOICELINK_KYC_TERMS_URL=original;}
});
