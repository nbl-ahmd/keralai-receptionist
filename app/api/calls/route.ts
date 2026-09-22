import { NextResponse } from 'next/server';
import { CallRecord } from '@/types';
import { getCalls, removeCall, upsertCall } from '@/lib/store';
import { CrmSyncResult, syncToCrm } from '@/lib/crm';
import { getProfile, upsertContact } from '@/lib/store';

export async function GET() {
  try {
    return NextResponse.json(await getCalls());
  } catch (error) {
    console.error('[api/calls] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read calls' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const call = (await request.json()) as CallRecord & { skipCrm?: boolean };
    if (!call?.callSid) {
      return NextResponse.json({ error: 'Missing callSid' }, { status: 400 });
    }

    const saved = await upsertCall({
      ...call,
      id: call.id || call.callSid,
      transcript: call.transcript ?? [],
      bookingIds: call.bookingIds ?? [],
      knowledgeQueries: call.knowledgeQueries ?? [],
      durationSec: call.durationSec ?? 0,
    });

    let crm: CrmSyncResult = { ok: true, provider: 'none', skipped: true };
    if (!call.skipCrm) {
      const contact = await upsertContact({
        name: saved.caller && saved.caller !== 'Unknown caller' ? saved.caller : null,
        phone: saved.phone ?? null,
        source: saved.channel === 'phone' ? 'phone' : 'web',
      });
      const profile = await getProfile();
      crm = await syncToCrm({
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
    console.error('[api/calls] POST failed:', error);
    return NextResponse.json({ error: 'Failed to save call' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    await removeCall(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/calls] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete call' }, { status: 500 });
  }
}
