import { NextResponse } from 'next/server';
import { query } from '@/db/client';
import {
  getTenant,
  handleApiError,
  resolveTenantWithList,
} from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/**
 * Returns the active tenant, the full list the user may switch between, and the
 * tenant's non-secret settings. Tenant context is resolved server-side; the
 * `x-tenant-id` header is only a hint and is validated against membership.
 */
export async function GET(request: Request) {
  try {
    const { context, tenants } = await resolveTenantWithList(request);
    const [tenant, settings] = await Promise.all([
      getTenant(context.tenantId),
      query<{ key: string; value: unknown }>(
        `select key, value from tenant_settings where tenant_id = $1 order by key`,
        [context.tenantId],
      ),
    ]);

    const settingsMap: Record<string, unknown> = {};
    for (const row of settings) settingsMap[row.key] = row.value;

    return NextResponse.json({
      tenant,
      tenants,
      role: context.role,
      settings: settingsMap,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load workspace');
  }
}

/** Renames the active workspace. Owners and admins only. */
export async function PATCH(request: Request) {
  try {
    const { context } = await resolveTenantWithList(request);
    if (context.role !== 'owner' && context.role !== 'admin') {
      return NextResponse.json({ error: 'You do not have permission to update this workspace' }, { status: 403 });
    }

    const body = (await request.json()) as { name?: string };
    const name = body?.name?.trim();
    if (!name) return NextResponse.json({ error: 'A workspace name is required' }, { status: 400 });

    await query(
      `update tenants set name = $1, updated_at = now() where id = $2`,
      [name.slice(0, 120), context.tenantId],
    );

    return NextResponse.json({ success: true, tenant: await getTenant(context.tenantId) });
  } catch (error) {
    return handleApiError(error, 'Failed to update workspace');
  }
}
