import type {AvailableNumber} from './types';
import {HttpError} from '@/lib/auth/context';
export function moneyMinor(value: unknown): number {
 const text=String(value);
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new HttpError(503,'Provider pricing requires operator review.');
 const [whole,fraction='']=text.split('.');
 const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount))throw new HttpError(503,'Provider pricing requires operator review.');
 return amount;
}
function configured(name:string) {
 const raw=process.env[name];
 if(!raw||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new HttpError(503,'Phone funding policy needs operator approval.');
 return Number(raw);
}
export function didPolicy() {
 const policy={setup:configured('ALPHA_MAX_DID_SETUP_COST_MINOR'),monthly:configured('ALPHA_MAX_DID_MONTHLY_COST_MINOR'),
  release:configured('ALPHA_DID_RELEASE_COST_MINOR'),maxRelease:configured('ALPHA_MAX_DID_RELEASE_COST_MINOR'),
  commitment:configured('ALPHA_MAX_DID_COMMITMENT_MONTHS'),floor:configured('ALPHA_MIN_VOBIZ_BALANCE_MINOR')};
 if(policy.release>policy.maxRelease)throw new HttpError(503,'Phone funding policy needs operator approval.');
 return policy;
}
export class InventoryReviewError extends HttpError {
 constructor(public reason:'metadata'|'pricing'|'exposure') {
  super(409,reason==='exposure'?'This number exceeds approved Alpha exposure.':'This number requires operator review.');
 }
}
export function didExposure(number:AvailableNumber,policy=didPolicy()):number {
 if(number.country!=='IN'||number.currency!=='INR'||!number.voice||number.available!==true||number.restricted!==false||
 !Number.isSafeInteger(number.commitmentMonths)||number.commitmentMonths!<0)throw new InventoryReviewError('metadata');
 let setup:number,monthly:number,release:number;
 // Published inventory contract does not guarantee an account-specific release fee.
 // A runtime quote can only increase exposure above the operator-confirmed policy.
 try {
  setup=moneyMinor(number.setupCost);monthly=moneyMinor(number.monthlyCost);
  release=Math.max(policy.release,number.releaseCost===undefined?0:moneyMinor(number.releaseCost));
 }catch(error){if(error instanceof HttpError)throw new InventoryReviewError('pricing');throw error;}
 if(setup>policy.setup||monthly>policy.monthly||release>policy.maxRelease||number.commitmentMonths!>policy.commitment)
  throw new InventoryReviewError('exposure');
 const exposure=setup+monthly*Math.max(1,number.commitmentMonths!)+release;
 if(!Number.isSafeInteger(exposure))throw new InventoryReviewError('pricing');
 return exposure;
}
export function assertParentFunding(balance:{availableMinor:number;active:boolean},exposure:number) {
 const floor=configured('ALPHA_MIN_VOBIZ_BALANCE_MINOR');
 if(!balance.active||balance.availableMinor-exposure<floor)throw new HttpError(503,'Phone activation is paused while the operator funds service.');
}
