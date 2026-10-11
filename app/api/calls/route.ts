import { NextResponse } from 'next/server';
import { CallRecord } from '@/types';
import { getCalls, getCallPage, getCallById, removeCall, upsertCall } from '@/lib/store';
import { CrmSyncResult, syncToCrm } from '@/lib/crm';
import { getProfile, upsertContact } from '@/lib/store';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const p=new URL(request.url).searchParams;
    const id=p.get('id');
    if(id){
      if(!/^[a-f0-9-]{36}$/i.test(id)) return NextResponse.json({error:'Call not found'},{status:404});
      const call=await getCallById(tenantId,id);
      return call?NextResponse.json(call,{headers:{'Cache-Control':'no-store'}}):NextResponse.json({error:'Call not found'},{status:404});
    }
    if(p.get('paginated')==='1'){
      const page=Math.min(10000,Math.max(1,Math.trunc(Number(p.get('page'))||1))),search=(p.get('search')??'').slice(0,120);
      const outcome=p.get('outcome')??'all',channel=p.get('channel')??'all',date=p.get('date')??'';
      if(!['all','answered','booked','escalated','missed'].includes(outcome)||!['all','phone','web'].includes(channel)||
        (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date).getTime())||new Date(date).toISOString().slice(0,10)!==date)))return NextResponse.json({error:'Invalid filters'},{status:400});
      return NextResponse.json(await getCallPage(tenantId,{page,search,outcome,channel,date}),{headers:{'Cache-Control':'no-store'}});
    }
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
