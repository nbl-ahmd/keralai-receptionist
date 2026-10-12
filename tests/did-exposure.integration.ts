import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '@/db/client';
import {transaction} from '@/db/transaction';
import {providerDidExposure} from '../bridge/entitlements.mjs';
test('provider budget retains current-month released exposure and fails closed for unknown legacy fees',async()=>{
 assert.match(process.env.TEST_SCHEMA!,/^keralai_test_[a-f0-9]{16}$/);
 const tenant=(await query("insert into tenants(name,slug) values('Exposure fixture','exposure-fixture') returning id"))[0].id;
 const account=(await query("insert into tenant_telephony_accounts(tenant_id,provider) values($1,'vobiz') returning id",[tenant]))[0].id;
 const number=(await query(`insert into phone_numbers(tenant_id,telephony_account_id,provider,e164,provider_monthly_cost,
 customer_monthly_price_minor,initial_charge_minor,idempotency_key,status,provisioning_status,created_at,released_at)
 values($1,$2,'vobiz','+914841234509','100',10000,10000,'exposure-fixture-number','released','released',now()-interval '2 months',now()) returning id`,[tenant,account]))[0].id;
 const exposure=()=>transaction(c=>providerDidExposure(c));
 assert.equal(await exposure(),Infinity,'unknown release this month never frees provider budget');
 await query('update phone_numbers set provider_exposure_minor=11000 where tenant_id=$1 and id=$2',[tenant,number]);
 assert.equal(await exposure(),11000,'known released fees remain in current-month exposure');
 await query("update phone_numbers set released_at=now()-interval '2 months' where tenant_id=$1 and id=$2",[tenant,number]);
 assert.equal(await exposure(),0,'historical released exposure is outside the current window');
 await query("update phone_numbers set status='failed',provisioning_status='purchase_unknown',provider_exposure_minor=null where tenant_id=$1 and id=$2",[tenant,number]);
 assert.equal(await exposure(),Infinity,'uncertain purchase retains unknown exposure regardless of age');
});
