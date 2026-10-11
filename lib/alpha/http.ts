import {HttpError,resolveTenantContext} from '@/lib/auth/context';
import {requireCapability} from './entitlements';
import {limitOperation} from '@/lib/telephony/store';
export async function alphaMutation(request:Request,capability:string,maxBytes=16384) {
 const context=await resolveTenantContext(request,{roles:['owner','admin']});
 const expected=new URL(process.env.BETTER_AUTH_URL??request.url).origin;
 if(request.headers.get('origin')!==expected)throw new HttpError(403,'Invalid request origin.');
 if((await request.clone().text()).length>maxBytes)throw new HttpError(413,'Request too large.');
 await limitOperation(context.tenantId,`alpha:${new URL(request.url).pathname}`,12);
 await requireCapability(context.tenantId,capability);
 return context;
}
