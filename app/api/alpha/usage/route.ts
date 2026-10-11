import {resolveTenantContext,handleApiError} from '@/lib/auth/context';
import {tenantUsage} from '@/lib/alpha/usage';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {const context=await resolveTenantContext(request);return Response.json(await tenantUsage(context.tenantId),{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return handleApiError(e,'Unable to load usage.');}
}
