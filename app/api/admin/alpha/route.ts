import {requirePlatformAdmin} from '@/lib/telephony/admin';
import {alphaAdminSnapshot,alphaAdminAction} from '@/lib/alpha/admin';
import {createInvite,inviteRateLimit} from '@/lib/alpha/invites';
import {HttpError,handleApiError} from '@/lib/auth/context';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {await requirePlatformAdmin(request);const page=Math.max(1,Math.min(10000,Math.trunc(Number(new URL(request.url).searchParams.get('page')))||1));
 return Response.json(await alphaAdminSnapshot(page),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return handleApiError(e,'Unable to load alpha administration.');}
}
export async function POST(request:Request) {
 try {const actor=await requirePlatformAdmin(request);
 if(request.headers.get('origin')!==new URL(process.env.BETTER_AUTH_URL??request.url).origin)throw new HttpError(403,'Invalid request origin.');
 if((await request.clone().text()).length>8192)throw new HttpError(413,'Request too large.');
 await inviteRateLimit(actor.id,'operator-alpha',30);
 const input=await request.json();
 if(input.action==='create_invite')return Response.json(await createInvite(actor.id,input),{headers:{'Cache-Control':'no-store'}});
 await alphaAdminAction(actor.id,input);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return handleApiError(e,'Unable to complete operator action.');}
}
