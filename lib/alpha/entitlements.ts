import { transaction } from '@/db/transaction';
import { AlphaAccessError } from '@/bridge/alpha-policy.mjs';
import { authorizeUsage as authorize } from '@/bridge/entitlements.mjs';
export const authorizeUsage = (tenantId:string,capability:string) => authorize(tenantId,capability,transaction);
export async function requireCapability(tenantId:string,capability:string) {
 const result=await authorizeUsage(tenantId,capability);
 if(!result.allowed)throw new AlphaAccessError(403,result.reason!);
 return result;
}
