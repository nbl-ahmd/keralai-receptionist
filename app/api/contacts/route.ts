import { NextResponse } from 'next/server';
import { getContacts, upsertContact } from '@/lib/store';
import { CrmSyncResult, syncToCrm } from '@/lib/crm';
import { getProfile } from '@/lib/store';

export async function GET() {
  try {
    return NextResponse.json(await getContacts());
  } catch (error) {
    console.error('[api/contacts] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read contacts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    const contact = await upsertContact({
      name: body.name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      company: body.company ?? null,
      source: 'dashboard',
    });

    let crm: CrmSyncResult = { ok: true, provider: 'none', skipped: true };
    if (body.syncCrm) {
      crm = await syncToCrm({ contact, company: await getProfile() });
    }

    return NextResponse.json({ success: true, contact, crm });
  } catch (error) {
    console.error('[api/contacts] POST failed:', error);
    return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 });
  }
}