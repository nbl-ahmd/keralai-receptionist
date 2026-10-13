import { requirePlatformAdmin } from '@/lib/telephony/admin';
import { query } from '@/db/client';
import { handleApiError } from '@/lib/auth/context';
export const dynamic = 'force-dynamic';
export async function GET(request:Request) {
  try {
    await requirePlatformAdmin(request);
    const page=Math.min(10000,Math.max(1,Math.trunc(Number(new URL(request.url).searchParams.get('page')))||1));
    const items=await query(`select id,actor_id,tenant_id,action,resource_id,reason,reference,created_at
      from (
        select id,actor_id,tenant_id,action,resource_id,reason,reference,created_at from platform_audit_events
        union all
        select id,actor_id,null::uuid as tenant_id,action,resource_id,reason,reference,created_at from alpha_operator_events
      ) events order by created_at desc,id desc limit 50 offset $1`,[(page-1)*50]);
    return Response.json({items,page,hasMore:items.length===50},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return handleApiError(error,'Unable to load operator history.');}
}
