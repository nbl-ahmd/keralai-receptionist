import { managedKycRoute } from '@/lib/telephony/providers/voicelink/kyc-http';
import { uploadManagedKyc } from '@/lib/telephony/providers/voicelink/kyc';
export const POST=(request:Request)=>managedKycRoute(request,(id,input)=>uploadManagedKyc(id,input as FormData),true);
