// Two explicitly validated provider responses. Never persist identity payloads.
/** @typedef {'not_started'|'pending'|'verified'|'failed'} KycState */
const states=new Set(['not_started','pending','verified','failed']);
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>{throw new Error('Invalid authoritative KYC response');};
/** @returns {KycState} */
const state=v=>states.has(v)?/** @type {KycState} */(v):fail();
export function normalizeKycStatus(data,expectedAuthId,account,parentAuthId) {
 if(!record(data))fail();
 if('sub_account_id' in data) {
  if(data.sub_account_id!==expectedAuthId||data.kyc_mode!=='customer_use'||data.business_type!=='individual'||typeof data.kyc_calls_blocked!=='boolean'||!record(data.verifications))fail();
  /** @type {Record<string,KycState>} */ const documents={};for(const key of ['pan','aadhaar'])if(data.verifications[key]!==undefined)documents[key]=state(data.verifications[key]);
  return {status:state(data.overall_status),callsBlocked:data.kyc_calls_blocked,documents};
 }
 // Observed live status uses auth_id/kyc_status and flat document states.
 // Its missing call gate is read from the documented parent-owned account API.
 if(data.auth_id!==expectedAuthId||data.business_type!=='individual'||!record(account)||account.auth_id!==expectedAuthId||
 account.parent_auth_id!==parentAuthId||account.kyc_mode!=='customer_use'||account.business_type!=='individual'||typeof account.kyc_calls_blocked!=='boolean')fail();
 /** @type {Record<string,KycState>} */ const documents={};for(const key of ['pan','aadhaar'])documents[key]=data[`${key}_status`]==null?'not_started':state(data[`${key}_status`]);
 return {status:state(data.kyc_status),callsBlocked:account.kyc_calls_blocked,documents};
}
