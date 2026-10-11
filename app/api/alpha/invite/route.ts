import { inspectInvite, inviteRateLimit } from '@/lib/alpha/invites';
import { handleApiError } from '@/lib/auth/context';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 try {
  if((await request.clone().text()).length>2048)return Response.json({error:'Request too large'},{status:413});
  const {token,email}=await request.json();
  // Hash the supplied token; no reliance on spoofable forwarded-IP headers.
  await inviteRateLimit('anonymous','invite-global',120);
  await inviteRateLimit(String(token),'invite-check',10);
  const invite=await inspectInvite(token,typeof email==='string'?email:undefined);
  return Response.json({valid:true,email:invite.email},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return handleApiError(e,'Invitation is unavailable.');}
}
