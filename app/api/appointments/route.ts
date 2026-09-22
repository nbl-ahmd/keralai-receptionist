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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    // Calendar export for a single booking: /api/appointments?id=…&format=ics
    const id = url.searchParams.get('id');
    const format = url.searchParams.get('format');
    if (id && format === 'ics') {
      const appointment = (await getAppointments()).find((item) => item.id === id);
      if (!appointment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const profile = await getProfile();
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
      return NextResponse.json(await getAvailability(availabilityDate));
    }

    return NextResponse.json(await getAppointments());
  } catch (error) {
    console.error('[api/appointments] GET failed:', error);
    return NextResponse.json({ error: 'Failed to read appointments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    const saved = await addAppointment({
      ...body,
      id: body.id || crypto.randomUUID(),
      status: body.status || 'confirmed',
      createdAt: body.createdAt || new Date().toISOString(),
    });

    // Mirror the booking into the CRM (best-effort).
    const contact = await upsertContact({
      name: saved.customerName,
      phone: saved.customerPhone ?? null,
      email: saved.customerEmail ?? null,
      source: saved.callSid ? 'phone' : 'dashboard',
    });
    const profile = await getProfile();
    const crm: CrmSyncResult = await syncToCrm({
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
    console.error('[api/appointments] POST failed:', error);
    return NextResponse.json({ error: 'Failed to save appointment' }, { status: 500 });
  }
}
export async function PATCH(request: Request) {
  try {
    const { id, status } = await request.json();
    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }
    const updated = await updateAppointmentStatus(id, status);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, appointment: updated });
  } catch (error) {
    console.error('[api/appointments] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    await removeAppointment(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/appointments] DELETE failed:', error);
    return NextResponse.json({ error: 'Failed to delete appointment' }, { status: 500 });
  }
}

/** Exposes the booking rules the agent follows, for the dashboard UI. */
export async function OPTIONS() {
  return NextResponse.json({ settings: bookingSettings });
}
