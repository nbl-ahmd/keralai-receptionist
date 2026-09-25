import { NextResponse } from 'next/server';
import { Appointment } from '@/types';
import {
  addAppointment,
  getAppointments,
  removeAppointment,
  updateAppointmentStatus,
} from '@/lib/store';
import { bookingSettings, buildIcs, getAvailability, validateBookingRequest } from '@/lib/booking';
import { CrmSyncResult, syncToCrm } from '@/lib/crm';
import { upsertContact } from '@/lib/store';
import { getProfile } from '@/lib/store';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const url = new URL(request.url);

    // Calendar export for a single booking: /api/appointments?id=…&format=ics
    const id = url.searchParams.get('id');
    const format = url.searchParams.get('format');
    if (id && format === 'ics') {
      const appointment = (await getAppointments(tenantId)).find((item) => item.id === id);
      if (!appointment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const profile = await getProfile(tenantId);
      const ics = buildIcs(appointment, profile.name || 'Appointment');
      return new NextResponse(ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="appointment-${appointment.id}.ics"`,
        },
      });
    }

    // Availability for a date: /api/appointments?availability=YYYY-MM-DD
    const availabilityDate = url.searchParams.get('availability');
    if (availabilityDate) {
      return NextResponse.json(await getAvailability(tenantId, availabilityDate));
    }

    return NextResponse.json(await getAppointments(tenantId));
  } catch (error) {
    return handleApiError(error, 'Failed to read appointments');
  }
}

export async function POST(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const body = (await request.json()) as Appointment & { skipValidation?: boolean };
    if (!body?.customerName || !body?.date || !body?.time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate against business hours unless the caller is an internal tool.
    if (!body.skipValidation) {
      const validation = validateBookingRequest(body.date, body.time);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 422 });
      }
    }

    const saved = await addAppointment(tenantId, {
      ...body,
      id: body.id || crypto.randomUUID(),
      status: body.status || 'confirmed',
      createdAt: body.createdAt || new Date().toISOString(),
    });

    // Mirror the booking into the tenant's CRM (best-effort).
    const contact = await upsertContact(tenantId, {
      name: saved.customerName,
      phone: saved.customerPhone ?? null,
      email: saved.customerEmail ?? null,
      source: saved.callSid ? 'phone' : 'dashboard',
    });
    const profile = await getProfile(tenantId);
    const crm: CrmSyncResult = await syncToCrm(tenantId, {
      contact,
      appointment: {
        date: saved.date,
        time: saved.time,
        reason: saved.reason,
        status: saved.status,
      },
      company: profile,
    });

    return NextResponse.json({ success: true, appointment: saved, crm });
  } catch (error) {
    return handleApiError(error, 'Failed to save appointment');
  }
}
export async function PATCH(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const { id, status } = await request.json();
    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }
    const updated = await updateAppointmentStatus(tenantId, id, status);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, appointment: updated });
  } catch (error) {
    return handleApiError(error, 'Failed to update appointment');
  }
}

export async function DELETE(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    await removeAppointment(tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete appointment');
  }
}

/** Exposes the booking rules the agent follows, for the dashboard UI. */
export async function OPTIONS() {
  return NextResponse.json({ settings: bookingSettings });
}
