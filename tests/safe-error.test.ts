import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseInfo} from '../bridge/release-info.mjs';
import {safeError} from '../bridge/safe-error.mjs';
test('provider error logs discard nested credentials, bodies and URL query tokens',()=>{
 const error={name:'ApiError',status:401,message:'key=secret-value',request:{url:'wss://provider?key=secret-value',headers:{authorization:'private-token'}},body:{pan:'private-identity'}};
 assert.deepEqual(safeError(error),{kind:'operation_failed',status:401});
 assert.deepEqual(safeError({name:'TimeoutError',code:'secret-value'}),{kind:'timeout'});
 assert.deepEqual(safeError(null),{kind:'operation_failed'});
});

test('public release identity exposes only validated commit hashes',()=>{
 assert.equal(releaseInfo({VERCEL_GIT_COMMIT_SHA:'cadd4387',VOBIZ_AUTH_TOKEN:'private-token'}).commit,'cadd4387');
 assert.equal(releaseInfo({RENDER_GIT_COMMIT:'0123456789abcdef'}).commit,'0123456789abcdef');
 assert.equal(releaseInfo({VERCEL_GIT_COMMIT_SHA:'private-token'}).commit,null);
 assert.ok(!JSON.stringify(releaseInfo({VOBIZ_AUTH_TOKEN:'private-token'})).includes('private-token'));
});
