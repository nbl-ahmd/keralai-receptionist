// Exact decimal INR -> paise ceiling, independent of customer rounded-minute charge.
export function providerCostMinor(value) {
 if(typeof value!=='string'||!/^\d{1,12}(\.\d{1,8})?$/.test(value))throw new Error('Provider cost requires review');
 const [whole,fraction='']=value.split('.');
 const scale=10n**BigInt(fraction.length),amount=BigInt(whole)*scale+BigInt(fraction||'0');
 const result=Number((amount*100n+scale-1n)/scale);
 if(!Number.isSafeInteger(result))throw new Error('Provider cost requires review');
 return result;
}
export async function settlePhoneSession(client,tenantId,providerCallId,{billableSeconds,providerCost,customerChargeMinor}) {
 if(!Number.isSafeInteger(billableSeconds)||billableSeconds<0||!Number.isSafeInteger(customerChargeMinor)||customerChargeMinor<0)throw new Error('Usage requires review');
 const providerMinor=providerCostMinor(providerCost);
 await client.query(`update alpha_voice_sessions set state='closed',settlement='settled',ended_at=coalesce(ended_at,now()),
 used_seconds=$3,provider_actual_minor=$4,customer_charge_minor=$5,end_reason=coalesce(end_reason,'cdr_settled')
 where tenant_id=$1 and kind='phone' and provider_call_id=$2 and settlement='pending'`,
 [tenantId,providerCallId,Math.ceil(billableSeconds/60)*60,providerMinor,customerChargeMinor]);
}
