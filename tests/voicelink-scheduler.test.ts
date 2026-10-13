import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function fixture(data: unknown, status = 200, origin = 'https://app.example') {
  return spawnSync(process.execPath, ['--input-type=module','-e', `
    globalThis.fetch=async(url,init)=>{
      if(String(url)!=='https://app.example/api/jobs/telephony'||init.redirect!=='manual'||init.headers.Authorization!=='Bearer fixture-cron')throw Error('Unexpected request');
      return Response.json(${JSON.stringify(data)},{status:${status}});
    };
    await import('./scripts/run-telephony-reconciliation.mjs');
  `], { encoding:'utf8', env:{NODE_ENV:'test',PATH:process.env.PATH,TELEPHONY_PUBLIC_ORIGIN:origin,CRON_SECRET:'fixture-cron'} });
}
const report={calls:0,numbers:0,kyc:0,rentals:0,voicelinkCheckouts:1,voicelinkAccounts:0,voicelinkReviews:0,failures:0,timeLimited:false};
test('scheduler logs only allowlisted counts and treats unresolved recovery as an alert', () => {
  const success=fixture({...report,private:'PRIVATE_PROVIDER_RESPONSE'});
  assert.equal(success.status,0);assert.ok(!success.stdout.includes('PRIVATE_'));assert.ok(!success.stdout.includes('fixture-cron'));
  const review=fixture({...report,voicelinkReviews:1});assert.equal(review.status,1);assert.match(review.stdout,/voicelinkReviews/);
  assert.equal(fixture({...report,timeLimited:true}).status,1);
});
test('scheduler rejects redirects and malformed reports without leaking headers or bodies', () => {
  for(const result of [fixture({private:'SECRET_BODY'},302),fixture({...report,failures:-1}),fixture(report,200,'http://unsafe.example')]) {
    assert.equal(result.status,1);assert.ok(!result.stdout.includes('SECRET_BODY'));assert.ok(!result.stderr.includes('fixture-cron'));
    assert.equal(result.stderr.trim(),'{"event":"scheduler.reconciliation.failed"}');
  }
});
