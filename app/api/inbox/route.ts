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
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

// Live data; never cache.
export const dynamic = 'force-dynamic';

/** Everything the receptionist captured: appointments, callbacks, quotes, messages. */
export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const [appointments, callbacks, quotes, messages] = await Promise.all([
      getAppointments(tenantId),
      getCallbackRequests(tenantId),
      getQuoteRequests(tenantId),
      getMessages(tenantId),
    ]);
    return NextResponse.json({ appointments, callbacks, quotes, messages });
  } catch (error) {
    return handleApiError(error, 'Failed to load inbox');
  }
}

/** Mark an item handled / read. Body: { type, id, status?, read? }. */
export async function PATCH(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
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
        await updateAppointmentStatus(tenantId, id, (body.status ?? 'confirmed') as 'confirmed' | 'pending' | 'cancelled');
        break;
      case 'callback':
        await updateCallbackStatus(tenantId, id, body.status ?? 'handled');
        break;
      case 'quote':
        await updateQuoteStatus(tenantId, id, body.status ?? 'contacted');
        break;
      case 'message':
        await markMessageRead(tenantId, id, body.read ?? true);
        break;
      default:
        return NextResponse.json({ error: 'unknown type' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, 'Failed to update item');
  }
}
