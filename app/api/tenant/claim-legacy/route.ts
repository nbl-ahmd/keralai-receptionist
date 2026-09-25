import { NextResponse } from 'next/server';
import { claimLegacyTenant } from '@/lib/tenant/provision';
import { handleApiError, requireUserId, listTenantsForUser } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/**
 * One-time claim of the pre-multitenancy "legacy" tenant by a trusted owner.
 *
 * Guarded two ways: the authenticated user's email must match
 * LEGACY_TENANT_CLAIM_EMAIL, and the claim ledger allows the legacy tenant to be
 * claimed only once. New users are unaffected — they already own a fresh tenant.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUserId(request);

    const claimEmail = (process.env.LEGACY_TENANT_CLAIM_EMAIL ?? '').trim().toLowerCase();
    const email = (user.email ?? '').trim().toLowerCase();
    if (!claimEmail || !email || email !== claimEmail) {
      return NextResponse.json({ error: 'Legacy data is not available for this account' }, { status: 403 });
    }

    const result = await claimLegacyTenant(user.id);
    if (!result) {
      return NextResponse.json({ error: 'Legacy data has already been claimed' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      tenantId: result.tenantId,
      role: result.role,
      tenants: await listTenantsForUser(user.id),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to claim legacy data');
  }
}
