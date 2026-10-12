import test from 'node:test';
import assert from 'node:assert/strict';
import {query} from '@/db/client';
test('incomplete or mismatched test schema configuration refuses public database access',async()=>{
 const before={TEST_SCHEMA:process.env.TEST_SCHEMA,KERALAI_TEST_SCHEMA:process.env.KERALAI_TEST_SCHEMA};
 try {
  for(const [runner,dashboard] of [['keralai_test_0123456789abcdef',undefined],[undefined,'keralai_test_0123456789abcdef'],['public','public'],['keralai_test_0123456789abcdef','keralai_test_fedcba9876543210']]) {
   if(runner===undefined)delete process.env.TEST_SCHEMA;else process.env.TEST_SCHEMA=runner;
   if(dashboard===undefined)delete process.env.KERALAI_TEST_SCHEMA;else process.env.KERALAI_TEST_SCHEMA=dashboard;
   await assert.rejects(query('select 1'),/Invalid test schema/);
  }
 }finally{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
