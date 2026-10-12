import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeKycStatus} from '../lib/telephony/providers/vobiz/kyc-status.mjs';
test('live flat KYC status requires matching parent-owned individual account and literal provider gate',()=>{
 const raw={auth_id:'SA_fixture',business_type:'individual',kyc_status:'pending',pan_status:null,aadhaar_status:null};
 const account={auth_id:'SA_fixture',parent_auth_id:'MA_fixture',kyc_mode:'customer_use',business_type:'individual',kyc_calls_blocked:true};
 assert.deepEqual(normalizeKycStatus(raw,'SA_fixture',account,'MA_fixture'),{status:'pending',callsBlocked:true,documents:{pan:'not_started',aadhaar:'not_started'}});
 for(const change of [{auth_id:'SA_other'},{parent_auth_id:'MA_other'},{kyc_mode:'personal_use'},{business_type:'private_limited'},{kyc_calls_blocked:undefined},{kyc_calls_blocked:'false'}])assert.throws(()=>normalizeKycStatus(raw,'SA_fixture',{...account,...change},'MA_fixture'));
 assert.throws(()=>normalizeKycStatus(raw,'SA_fixture',undefined,'MA_fixture'));
 assert.equal(normalizeKycStatus({...raw,kyc_status:'verified'},'SA_fixture',account,'MA_fixture').callsBlocked,true);
 assert.equal(normalizeKycStatus({...raw,kyc_status:'verified',pan_status:'verified',aadhaar_status:'verified'},'SA_fixture',{...account,kyc_calls_blocked:false},'MA_fixture').callsBlocked,false);
});
test('published aggregated KYC contract rejects foreign identities, missing gates and unknown document states',()=>{
 const data={sub_account_id:'SA_fixture',kyc_mode:'customer_use',business_type:'individual',overall_status:'verified',kyc_calls_blocked:false,verifications:{pan:'verified',aadhaar:'verified'}};
 assert.equal(normalizeKycStatus(data,'SA_fixture').callsBlocked,false);
 for(const change of [{sub_account_id:'SA_other'},{kyc_calls_blocked:undefined},{verifications:{pan:'success'}}])assert.throws(()=>normalizeKycStatus({...data,...change},'SA_fixture'));
});
