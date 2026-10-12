import { HttpError } from '@/lib/auth/context';
export class ProviderError extends HttpError {
  constructor(public code: string, public uncertain = false, public providerStatus?: number, public operation='provider_request') {
    super(503,providerMessage(code,providerStatus));
  }
}
function providerMessage(code:string,status?:number) {
  if(code==='not_configured'||code==='missing_runtime_credential')return 'Phone service configuration needs your organiser’s attention.';
  if(status===401||status===403)return 'The phone provider denied access. Contact your organiser to check the account configuration.';
  if(status===404)return 'The phone provider could not find the requested account or service. Contact your organiser.';
  if(status===422||status===400)return 'The phone provider could not accept this setup request. Contact your organiser.';
  if(status===429)return 'The phone provider is busy. Wait a minute before trying again.';
  return 'Phone service is temporarily unavailable. Please try again shortly.';
}
const codes=new Set(['not_configured','missing_runtime_credential','network_or_response','invalid_call','invalid_inventory',
  'invalid_kyc_account','invalid_kyc_url','invalid_price','invalid_response','purchase_mismatch','routing_unconfirmed']);
const operations=new Set(['provider_request','create_account','read_account','kyc_session','kyc_status','balance','inventory',
  'purchase','owned_numbers','release','application','routing','call','cdr']);
export function providerErrorDetails(error:ProviderError) {
  return {providerCode:codes.has(error.code)||/^http_[45]\d{2}$/.test(error.code)?error.code:'provider_failed',
    providerStatus:Number.isInteger(error.providerStatus)&&error.providerStatus!>=400&&error.providerStatus!<=599?error.providerStatus:undefined,
    operation:operations.has(error.operation)?error.operation:'provider_request',uncertain:error.uncertain===true};
}
