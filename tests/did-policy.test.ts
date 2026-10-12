import test from 'node:test';
import assert from 'node:assert/strict';
import {didExposure,moneyMinor,assertParentFunding} from '@/lib/telephony/did-policy';
test('DID exposure fails closed for missing metadata, costs, commitments and funding',()=>{
 Object.assign(process.env,{ALPHA_MAX_DID_SETUP_COST_MINOR:'1000',ALPHA_MAX_DID_MONTHLY_COST_MINOR:'10000',ALPHA_DID_RELEASE_COST_MINOR:'70000',ALPHA_MAX_DID_RELEASE_COST_MINOR:'70000',ALPHA_MAX_DID_COMMITMENT_MONTHS:'2',ALPHA_MIN_VOBIZ_BALANCE_MINOR:'10000'});
 const number={id:'fixture',e164:'+914841234501',country:'IN',region:'Kerala',currency:'INR',monthlyCost:'100',setupCost:'10',voice:true,available:true,restricted:false,commitmentMonths:2};
 assert.equal(didExposure(number),91000);
 for(const change of [{releaseCost:'701'},{setupCost:''},{monthlyCost:'100.001'},{monthlyCost:'101'},{commitmentMonths:3},{commitmentMonths:undefined},{restricted:undefined},{available:false},{currency:'USD'},{voice:false}])assert.throws(()=>didExposure({...number,...change}));
 assert.throws(()=>assertParentFunding({availableMinor:100999,active:true},91000));
 assert.throws(()=>assertParentFunding({availableMinor:101000,active:false},91000));
 assert.doesNotThrow(()=>assertParentFunding({availableMinor:101000,active:true},91000));
 delete process.env.ALPHA_DID_RELEASE_COST_MINOR;assert.throws(()=>didExposure(number));
 assert.equal(moneyMinor('0.01'),1);assert.throws(()=>moneyMinor('-1'));assert.throws(()=>moneyMinor('1e4'));
});
