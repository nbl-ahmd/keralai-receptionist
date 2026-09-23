import { NextResponse } from 'next/server';
import {
  getAppointments,
  getCallbackRequests,
  getMessages,
  getQuoteRequests,
  markMessageRead,
  updateAppointmentStatus,
  updateCallbackStatus,
  updateQuoteStatus,
} from '@/lib/store';

// Live data; never cache.
export const dynamic = 'force-dynamic';

/** Everything the receptionist captured: appointments, callbacks, quotes, messages. */
export async function GET() {
  try {
    const [appointments, callbacks, quotes, messages] = await Promise.all([
      getAppointments(),
      getCallbackRequests(),
      getQuoteRequests(),
      getMessages(),
    ]);
    return NextResponse.json({ appointments, callbacks, quotes, messages });
  } catch (error) {
    console.error('[api/inbox] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load inbox' }, { status: 500 });
  }
}

/** Mark an item handled / read. Body: { type, id, status?, read? }. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      type?: string;
      id?: string;
      status?: string;
      read?: boolean;
    };
    const { type, id } = body;
    if (!type || !id) {
      return NextResponse.json({ error: 'type and id are required' }, { status: 400 });
    }

    switch (type) {
      case 'appointment':
        await updateAppointmentStatus(id, (body.status ?? 'confirmed') as 'confirmed' | 'pending' | 'cancelled');
        break;
      case 'callback':
        await updateCallbackStatus(id, body.status ?? 'handled');
        break;
      case 'quote':
        await updateQuoteStatus(id, body.status ?? 'contacted');
        break;
      case 'message':
        await markMessageRead(id, body.read ?? true);
        break;
      default:
        return NextResponse.json({ error: 'unknown type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/inbox] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}
