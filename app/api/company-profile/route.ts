import { NextResponse } from 'next/server';
import { getProfile, saveProfile } from '@/lib/store';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    return NextResponse.json(await getProfile(tenantId));
  } catch (error) {
    return handleApiError(error, 'Failed to read profile');
  }
}

export async function POST(request: Request) {
  try {
    // Company profile is workspace configuration: only owners/admins may change it.
    const { tenantId } = await resolveTenantContext(request, { roles: ['owner', 'admin'] });
    const profile = await request.json();
    const saved = await saveProfile(tenantId, profile);
    return NextResponse.json({ success: true, profile: saved });
  } catch (error) {
    return handleApiError(error, 'Failed to save profile');
  }
}
