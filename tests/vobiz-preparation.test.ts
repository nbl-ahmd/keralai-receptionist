import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('disposable provider creation refuses absent explicit operator approval before requests',()=>{
 const env={...process.env};delete env.VOBIZ_KYC_TEST_CREATE_APPROVED;
 const result=spawnSync(process.execPath,['scripts/prepare-vobiz-kyc-test.mjs','--create'],{env,encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/No provider request made/);
});

test('blocked provider preparation refuses retry without explicit approval before requests',()=>{
 const env={...process.env};delete env.VOBIZ_KYC_TEST_RETRY_APPROVED;
 const result=spawnSync(process.execPath,['scripts/prepare-vobiz-kyc-test.mjs','--retry-prepared'],{env,encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/No provider request made/);
});
