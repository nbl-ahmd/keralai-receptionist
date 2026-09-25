import { NextResponse } from 'next/server';
import {
  buildExotelWsUrl,
  getExotelCredential,
  rotateExotelCredential,
} from '@/lib/tenant/bridge-url';
import { getTenant, handleApiError, resolveTenantContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/**
 * Exotel routing status for the active tenant. Returns the WebSocket URL with a
 * `token=REPLACE_ME` placeholder — the real token is shown only once, on rotate.
 */
export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    const [tenant, credential] = await Promise.all([
      getTenant(tenantId),
      getExotelCredential(tenantId),
    ]);
    return NextResponse.json({
      credential,
      slug: tenant?.slug ?? null,
      wsUrl: tenant ? buildExotelWsUrl(tenant.slug, 'REPLACE_ME') : null,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load Exotel routing');
  }
}

/**
 * Rotates the tenant's Exotel token and returns the plaintext token + full URL
 * exactly once. Only a hash is stored server-side.
 */
export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    const tenant = await getTenant(tenantId);
    if (!tenant) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const { token, tokenLast4, rotatedAt } = await rotateExotelCredential(tenantId);
    return NextResponse.json({
      success: true,
      token,
      tokenLast4,
      rotatedAt,
      slug: tenant.slug,
      wsUrl: buildExotelWsUrl(tenant.slug, token),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to rotate Exotel token');
  }
}
