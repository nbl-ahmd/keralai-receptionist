import test from 'node:test';
import assert from 'node:assert/strict';
import {safeError} from '../bridge/safe-error.mjs';
test('provider error logs discard nested credentials, bodies and URL query tokens',()=>{
 const error={name:'ApiError',status:401,message:'key=secret-value',request:{url:'wss://provider?key=secret-value',headers:{authorization:'private-token'}},body:{pan:'private-identity'}};
 assert.deepEqual(safeError(error),{kind:'operation_failed',status:401});
 assert.deepEqual(safeError({name:'TimeoutError',code:'secret-value'}),{kind:'timeout'});
 assert.deepEqual(safeError(null),{kind:'operation_failed'});
});
