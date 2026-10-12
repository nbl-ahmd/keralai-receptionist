export interface PhoneSummary {
  account: null | { kycStatus:string; callsBlocked:boolean; documents:Record<string,string>; status:string;
    sessionStatus:string|null; sessionExpiresAt:string|null; lastCheckedAt:string|null };
  numbers: Array<{id:string;e164:string;region:string;status:string;provisioningStatus:string;releaseRequested:boolean;monthlyPriceMinor:number}>;
  wallet:{balanceMinor:number;heldMinor:number;availableMinor:number;status:string};
  phoneCallsReady:boolean;phoneReadinessReason:string|null;browserTestCompleted:boolean;kycAvailable:boolean;phoneActivationApproved:boolean;configured:boolean;assistantConfigured:boolean;assistantNeedsRepair?:boolean;assistantManaged?:boolean;paymentsEnabled:boolean;
}
export const money=(minor:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(minor/100);
export async function phoneApi(path:string,body?:unknown,key?:string) {
  const response=await fetch(path,{cache:'no-store',...(body!==undefined ? {method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok) {
    const reference=typeof data.requestId==='string'&&/^[a-f0-9-]{36}$/.test(data.requestId)?` Support reference: ${data.requestId}.`:'';
    throw new Error((data.error ?? 'Unable to complete this step. Please try again.')+reference);
  }
  return data;
}
