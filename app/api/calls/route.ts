import { NextResponse } from 'next/server';
import { CallRecord } from '@/types';
import { getCalls, removeCall, upsertCall } from '@/lib/store';
import { CrmSyncResult, syncToCrm } from '@/lib/crm';
import { getProfile, upsertContact } from '@/lib/store';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    return NextResponse.json(await getCalls(tenantId));
  } catch (error) {
    return handleApiError(error, 'Failed to read calls');
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const call = (await request.json()) as CallRecord & { skipCrm?: boolean };
    if (!call?.callSid) {
      return NextResponse.json({ error: 'Missing callSid' }, { status: 400 });
    }

    const saved = await upsertCall(tenantId, {
      ...call,
      id: call.id || call.callSid,
      transcript: call.transcript ?? [],
      bookingIds: call.bookingIds ?? [],
      knowledgeQueries: call.knowledgeQueries ?? [],
      durationSec: call.durationSec ?? 0,
    });

    let crm: CrmSyncResult = { ok: true, provider: 'none', skipped: true };
    if (!call.skipCrm) {
      const contact = await upsertContact(tenantId, {
        name: saved.caller && saved.caller !== 'Unknown caller' ? saved.caller : null,
        phone: saved.phone ?? null,
        source: saved.channel === 'phone' ? 'phone' : 'web',
      });
      const profile = await getProfile(tenantId);
      crm = await syncToCrm(tenantId, {
        contact,
        call: {
          callSid: saved.callSid,
          intent: saved.intent,
          outcome: saved.outcome,
          summary: saved.summary,
          durationSec: saved.durationSec,
          startedAt: saved.startedAt,
        },
        company: profile,
      });
    }

    return NextResponse.json({ success: true, call: saved, crm });
  } catch (error) {
    return handleApiError(error, 'Failed to save call');
  }
}

export async function DELETE(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    await removeCall(tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete call');
  }
}
