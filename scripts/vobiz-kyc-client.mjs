// Explicitly synthetic KYC only. Never guesses endpoints or logs provider bodies.
export class KycContractError extends Error {
 constructor(status,operation,requestId=null) {
  super(status===404?'Documented Vobiz KYC endpoint or account was not found. Ask Vobiz to confirm test-mode availability before retrying.':
   status===401||status===403?'Vobiz denied access. Check parent credentials and disposable subaccount ownership.':
   'Vobiz KYC contract request failed. Review the safe result file before retrying.');
  this.status=status;this.operation=operation;this.requestId=requestId;
 }
}
const steps=new Set(['verify-pan','finalize-pending','digilocker/verify']);
export function kycTestClient(env,fetcher=fetch) {
 const id=env.VOBIZ_KYC_TEST_SUBACCOUNT,parent=env.VOBIZ_AUTH_ID;
 if(env.VOBIZ_KYC_TEST_DISPOSABLE!=='1'||!/^SA_[A-Za-z0-9_-]+$/.test(id??''))throw new Error('An explicitly disposable SA account is required');
 if(!parent||!env.VOBIZ_AUTH_TOKEN)throw new Error('Parent credentials required');
 async function request(path,operation,body) {
  let response;
  try {
   response=await fetcher('https://api.vobiz.ai/api/v1'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'X-Auth-ID':parent,'X-Auth-Token':env.VOBIZ_AUTH_TOKEN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  }catch{throw new KycContractError(null,operation);}
  if(!response.ok) {
   const raw=response.headers.get('x-request-id');
   // Ignore arbitrary header content; retain only bounded conventional request IDs.
   const requestId=raw&&/^[a-f0-9-]{8,64}$/i.test(raw)?raw:null;
   throw new KycContractError(response.status,operation,requestId);
  }
  try{return await response.json();}catch{throw new KycContractError(response.status,operation);}
 }
 return {
  status:()=>request(`/sub-accounts/${encodeURIComponent(id)}/kyc/status`,'kyc_status'),
  account:()=>request(`/accounts/${encodeURIComponent(parent)}/sub-accounts/${encodeURIComponent(id)}`,'read_account'),
  mock:(step,body)=>{
   if(!steps.has(step))throw new Error('Unsupported synthetic KYC step');
   return request(`/sub-accounts/test/${encodeURIComponent(id)}/kyc/${step}`,step,body);
  },
 };
}
