import { managedKycRoute } from '@/lib/telephony/providers/voicelink/kyc-http';
import { readManagedKyc, actManagedKyc } from '@/lib/telephony/providers/voicelink/kyc';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>managedKycRoute(request,id=>readManagedKyc(id));
export const POST=(request:Request)=>managedKycRoute(request,(id,input)=>actManagedKyc(id,input as Record<string,unknown>));
