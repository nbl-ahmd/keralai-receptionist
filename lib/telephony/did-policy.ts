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
export function didExposure(number:AvailableNumber):number {
 if(number.country!=='IN'||number.currency!=='INR'||!number.voice||number.available!==true||number.restricted!==false||
 !Number.isSafeInteger(number.commitmentMonths)||number.commitmentMonths!<0)throw new HttpError(409,'This number requires operator review.');
 const setup=moneyMinor(number.setupCost),monthly=moneyMinor(number.monthlyCost);
 // Published inventory contract does not guarantee an account-specific release fee.
 // A runtime quote can only increase exposure above the operator-confirmed policy.
 const release=Math.max(configured('ALPHA_DID_RELEASE_COST_MINOR'),number.releaseCost===undefined?0:moneyMinor(number.releaseCost));
 if(setup>configured('ALPHA_MAX_DID_SETUP_COST_MINOR')||monthly>configured('ALPHA_MAX_DID_MONTHLY_COST_MINOR')||
 release>configured('ALPHA_MAX_DID_RELEASE_COST_MINOR')||number.commitmentMonths!>configured('ALPHA_MAX_DID_COMMITMENT_MONTHS'))throw new HttpError(409,'This number exceeds approved Alpha exposure.');
 const exposure=setup+monthly*Math.max(1,number.commitmentMonths!)+release;
 if(!Number.isSafeInteger(exposure))throw new HttpError(503,'Provider pricing requires operator review.');
 return exposure;
}
export function assertParentFunding(balance:{availableMinor:number;active:boolean},exposure:number) {
 const floor=configured('ALPHA_MIN_VOBIZ_BALANCE_MINOR');
 if(!balance.active||balance.availableMinor-exposure<floor)throw new HttpError(503,'Phone activation is paused while the operator funds service.');
}
