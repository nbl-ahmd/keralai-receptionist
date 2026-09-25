import { NextResponse } from 'next/server';
import { getContacts, upsertContact } from '@/lib/store';
import { CrmSyncResult, syncToCrm } from '@/lib/crm';
import { getProfile } from '@/lib/store';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    return NextResponse.json(await getContacts(tenantId));
  } catch (error) {
    return handleApiError(error, 'Failed to read contacts');
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      email?: string;
      company?: string;
      syncCrm?: boolean;
    };

    if (!body?.name && !body?.phone && !body?.email) {
      return NextResponse.json({ error: 'Provide a name, phone, or email' }, { status: 400 });
    }

    const contact = await upsertContact(tenantId, {
      name: body.name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      company: body.company ?? null,
      source: 'dashboard',
    });

    let crm: CrmSyncResult = { ok: true, provider: 'none', skipped: true };
    if (body.syncCrm) {
      crm = await syncToCrm(tenantId, { contact, company: await getProfile(tenantId) });
    }

    return NextResponse.json({ success: true, contact, crm });
  } catch (error) {
    return handleApiError(error, 'Failed to save contact');
  }
}
