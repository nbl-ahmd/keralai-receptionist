import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAuthRequest} from '../lib/auth/server';
import {inviteHash,validInviteToken} from '../lib/alpha/invites';
test('invite hashes and signup entry points reject absent/malformed invite without public fallback',async()=>{
 assert.equal(validInviteToken('a'.repeat(43)),true);assert.equal(validInviteToken('shared-code'),false);
 assert.equal(inviteHash('secret').length,64);assert.notEqual(inviteHash('a'),inviteHash('b'));
 for(const path of ['/api/auth/sign-up/email','/api/auth/sign-up%2Femail','/api/auth/sign-up/email/','/api/auth/sign-up/social']){
  const r=await handleAuthRequest(new Request('https://app.example'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'outsider@example.test'})}));assert.equal(r.status,403);
 }
});

test('oversized authentication payload rejects before database/password work',async()=>{
 const response=await handleAuthRequest(new Request('https://app.example/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'fixture@example.test',password:'x'.repeat(20000)})}));
 assert.equal(response.status,413);
});
