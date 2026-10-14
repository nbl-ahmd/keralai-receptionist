import { query } from '@/db/client';
import { HttpError } from '@/lib/auth/context';
import { getAccount, withOperationLock } from '../../store';
import { requirePhoneSetupEligibility } from '../../service';
import { VoiceLinkClient, providerId, record, type VoiceLinkData } from './client';
import { safeProfile, safeKyc } from './schemas';
import { publicOrigin } from '../../policy';

export function kycTermsUrl() {
  const value=process.env.VOICELINK_KYC_TERMS_URL;
  if(!value)return null;
  try {
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['app.voicelink.co.in','voicelink.co.in'].includes(url.hostname)?url.href:null;
  }catch{return null;}
}
export function managedKycState(raw: VoiceLinkData) {
  if (raw.account_type == null && raw.is_complete === false && raw.pan_verified === false && raw.aadhaar_verified === false) {
    raw={...raw,account_type:'individual',current_step:'register'};
  }
  const kyc=safeKyc(raw);
  const required=raw.account_type==='business'?['pan','aadhaar','gst'] as const:['pan','aadhaar'] as const;
  const docs=raw.documents && typeof raw.documents==='object' && !Array.isArray(raw.documents)?raw.documents as VoiceLinkData:{};
  const documents=Object.fromEntries(required.map(type=>[type,{verified:raw[`${type}_verified`]===true,
    uploaded:!!docs[type] && typeof docs[type]==='object' && (docs[type] as VoiceLinkData).uploaded===true}]));
  return {termsUrl:kycTermsUrl(),status:kyc.status,accountType:raw.account_type as 'individual'|'business',
    agreementNeedsAcceptance:raw.agreement_reacceptance_required===true,
    step:['register','pan','aadhaar','gst','complete'].includes(String(raw.current_step))?String(raw.current_step):'register',
    documents,readyForSubmission:raw.agreement_reacceptance_required!==true&&required.every(type=>documents[type].verified&&documents[type].uploaded),
    finalSubmissionAvailable:process.env.VOICELINK_CLIENT_KYC_FINALIZE_VERIFIED==='1'};
}
export function kycRedirect(value:unknown) {
  if(typeof value!=='string'||value.length>4096)throw new HttpError(503,'Verification redirect is unavailable.');
  let url:URL;try{url=new URL(value);}catch{throw new HttpError(503,'Verification redirect is unavailable.');}
  const hosts=['digilocker.gov.in','digilocker.meripehchaan.gov.in',...(process.env.VOICELINK_KYC_REDIRECT_HOSTS??'').split(',').map(v=>v.trim()).filter(v=>/^[a-z0-9.-]+$/.test(v))];
  if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname))throw new HttpError(503,'Your operator must verify the identity-service redirect domain.');
  return url.href;
}
function text(input:Record<string,unknown>,key:string,max:number) {
  const value=input[key];if(typeof value!=='string'||!value.trim()||value.length>max)throw new HttpError(400,'Complete the required verification details.');
  return value.trim();
}
export async function ownedKycClient(tenantId:string,client:VoiceLinkClient) {
  const account=await getAccount(tenantId,'voicelink');
  if(!account?.provider_auth_id||account.status!=='active')throw new HttpError(409,'Set up your phone account first.');
  const id=providerId(account.provider_auth_id),profile=safeProfile(await client.profile());
  if(account.provider_account_id!==`${profile.id}:${id}`||!profile.active||!profile.verified)throw new HttpError(409,'Your operator must review the phone account.');
  const customer=(await client.clients()).find(row=>providerId(row.id)===id);
  if(!customer||customer.currency!=='INR'||customer.is_active!==1)throw new HttpError(409,'Your operator must review the phone account.');
  return id;
}
export async function readManagedKyc(tenantId:string,client=new VoiceLinkClient()) {
  const id=await ownedKycClient(tenantId,client);return managedKycState(await client.kyc(id));
}
export async function actManagedKyc(tenantId:string,input:Record<string,unknown>,client=new VoiceLinkClient()) {
  await requirePhoneSetupEligibility(tenantId);
  return withOperationLock(tenantId,async()=>{
    const id=await ownedKycClient(tenantId,client),action=input.action;
    const scope={client_id:Number(id)};
    const resetGate=()=>query("update tenant_telephony_accounts set kyc_status='pending',kyc_calls_blocked=true,document_states='{}'::jsonb,kyc_verified_at=null,kyc_last_checked_at=now(),updated_at=now() where tenant_id=$1 and provider='voicelink'",[tenantId]);
    if(action==='verify_email'||action==='resend_email') {
      const customer=(await client.clients()).find(row=>providerId(row.id)===id);
      const username=customer?.username;
      if(typeof username!=='string'||!username||username.length>100)throw new HttpError(409,'Your organiser must review email confirmation for this account.');
      const otp=action==='verify_email'?text(input,'otp',6):null;
      if(otp&&!/^\d{6}$/.test(otp))throw new HttpError(400,'Enter the six-digit email code.');
      await client.request(action==='verify_email'?'/auth/verify-otp':'/auth/resend-otp',{method:'POST',operation:'kyc_email',body:{username,...(otp?{otp}:{})}});
    }else if(action==='register') {
      if(!kycTermsUrl())throw new HttpError(503,'Your organiser must publish the provider verification terms before consent can be accepted.');
      if(input.acceptTerms!==true)throw new HttpError(400,'Review and accept the provider terms to continue.');
      if(!['individual','business'].includes(String(input.accountType)))throw new HttpError(400,'Choose individual or business verification.');
      const phone=text(input,'phone',16);if(!/^\+?91\d{10}$/.test(phone))throw new HttpError(400,'Enter an Indian contact number with country code 91.');
      const pincode=text(input,'pincode',6);if(!/^\d{6}$/.test(pincode))throw new HttpError(400,'Enter a six-digit postal code.');
      await resetGate();
      await client.request('/reseller/kyc/step-1-register-details',{method:'POST',operation:'kyc_register',body:{...scope,
        term_and_condition:true,account_type:input.accountType,full_name:text(input,'fullName',150),phone,
        billing_address:text(input,'address',500),state:text(input,'state',100),city:text(input,'city',100),pincode,
        ...(input.accountType==='business'?{business_name:text(input,'businessName',150)}:{})}});
    }else if(action==='pan') {
      const pan=text(input,'pan',10).toUpperCase();if(!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan))throw new HttpError(400,'Enter a valid PAN.');
      await resetGate();
      await client.request('/reseller/kyc/step-2-pan-verify',{method:'POST',operation:'kyc_pan',body:{...scope,pan_number:pan,pan_holder_name:text(input,'holderName',150)}});
    }else if(action==='aadhaar') {
      const result=record(await client.request('/reseller/kyc/step-3-aadhaar-init',{method:'POST',operation:'kyc_aadhaar',body:{...scope,
        redirect_url:`${publicOrigin()}/api/telephony/voicelink/kyc/return`}}));
      return {redirectUrl:kycRedirect(result.redirect_url)};
    }else if(action==='gst') {
      const gst=text(input,'gst',15).toUpperCase();if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gst))throw new HttpError(400,'Enter a valid GSTIN.');
      const state=managedKycState(await client.kyc(id));if(state.accountType!=='business')throw new HttpError(400,'GST verification applies to businesses.');
      await resetGate();
      await client.request('/reseller/kyc/step-4-gst-verify',{method:'POST',operation:'kyc_gst',body:{...scope,gst_number:gst}});
    }else if(action==='submit') {
      if(process.env.VOICELINK_CLIENT_KYC_FINALIZE_VERIFIED!=='1')throw new HttpError(503,'Client-scoped final submission is awaiting provider confirmation. Your progress is saved with the verification provider.');
      if(!managedKycState(await client.kyc(id)).readyForSubmission)throw new HttpError(409,'Complete verification and supporting documents first.');
      await client.request('/reseller/kyc/final-submit',{method:'POST',operation:'kyc_submit',body:scope});
    }else throw new HttpError(400,'Unknown verification step.');
    return readManagedKyc(tenantId,client);
  });
}
export function documentType(file:File) {
  const type=file.type;
  if(file.size===0||file.size>3*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(type))throw new HttpError(400,'Choose a PDF, JPG or PNG document up to 3 MB.');
  return type;
}
export async function uploadManagedKyc(tenantId:string,data:FormData,client=new VoiceLinkClient()) {
  await requirePhoneSetupEligibility(tenantId);
  return withOperationLock(tenantId,async()=>{
    const id=await ownedKycClient(tenantId,client),type=data.get('documentType'),file=data.get('document');
    if(!['pan','aadhaar','gst'].includes(String(type))||!(file instanceof File))throw new HttpError(400,'Choose the document to upload.');
    const mime=documentType(file),bytes=new Uint8Array(await file.slice(0,8).arrayBuffer());
    const valid=mime==='application/pdf'?new TextDecoder().decode(bytes).startsWith('%PDF-'):mime==='image/png'?[137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!valid)throw new HttpError(400,'The document format does not match the selected file type.');
    const state=managedKycState(await client.kyc(id));if(!state.documents[String(type)]?.verified)throw new HttpError(409,'Verify this identity detail before uploading its document.');
    const body=new FormData();body.set('client_id',id);body.set('document_type',String(type));
    body.set('document',file,`${type}.${mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg'}`);
    await client.request('/reseller/kyc/upload-document',{method:'POST',operation:'kyc_upload',body});
    return readManagedKyc(tenantId,client);
  });
}
