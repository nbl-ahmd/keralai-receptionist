import test from 'node:test';
import assert from 'node:assert/strict';
import {providerCostMinor,settlePhoneSession} from '../bridge/alpha-billing.mjs';
test('provider decimals and CDR quota settlement remain separate from customer pricing',async()=>{
 assert.equal(providerCostMinor('0.7'),70);assert.equal(providerCostMinor('0.001'),1);assert.equal(providerCostMinor('11.00001'),1101);assert.equal(providerCostMinor('0'),0);
 for(const value of ['NaN','-1','1e4','1.234567891'])assert.throws(()=>providerCostMinor(value),/review/);
 let parameters:any[]=[];
 const client={query:async(_sql:string,values:any[])=>{parameters=values;return {rows:[]};}};
 await settlePhoneSession(client,'tenantA','provider-uuid',{billableSeconds:61,providerCost:'0.7',customerChargeMinor:200});
 assert.deepEqual(parameters,['tenantA','provider-uuid',120,70,200]);
 await assert.rejects(settlePhoneSession(client,'a','b',{billableSeconds:-1,providerCost:'0',customerChargeMinor:0}));
});
