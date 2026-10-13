import { createInvite } from '../lib/alpha/invites';
import { handleAuthRequest } from '../lib/auth/server';
import { resolveTenantContext } from '../lib/auth/context';
// Only the disposable integration schema can create this operator fixture.
async function main() {
  if (!/^keralai_test_[a-f0-9]{16}$/.test(process.env.TEST_SCHEMA ?? '')) throw new Error('Isolated schema required');
  process.env.ALPHA_INVITE_ISSUANCE_ENABLED='1';
  console.info=(...values)=>console.error(...values);
  const email='platform-operator@example.test';
  const invite=await createInvite('ui-fixture',{email,reason:'Isolated admin UI fixture'});
  const response=await handleAuthRequest(new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-up/email`,{
    method:'POST',headers:{Origin:process.env.BETTER_AUTH_URL!,'Content-Type':'application/json','x-alpha-invite-code':invite.token},
    body:JSON.stringify({email,password:'fixture-operator-password-123',name:'Platform operator'}),
  }));
  if (!response.ok) throw new Error('Operator fixture signup failed');
  const cookie=response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const context=await resolveTenantContext(new Request(`${process.env.BETTER_AUTH_URL}/api/tenant`,{headers:{cookie}}));
  process.stdout.write(context.userId);
  await globalThis.__keralaiAuthPgPool?.end();
}
void main().catch(error=>{console.error(error instanceof Error ? error.message : 'Fixture failed');process.exitCode=1;});
