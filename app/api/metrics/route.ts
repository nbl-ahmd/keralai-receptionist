import { NextResponse } from 'next/server';
import { getMetrics } from '@/lib/store';
import { getCrmStatus } from '@/lib/crm';
import { bookingSettings } from '@/lib/booking';

// Metrics change with every call; never serve a cached snapshot.
export const dynamic = 'force-dynamic';

/** Aggregated dashboard metrics computed in Postgres. */
export async function GET() {
  try {
    const [metrics, crm] = await Promise.all([getMetrics(), Promise.resolve(getCrmStatus())]);
    return NextResponse.json({
      metrics,
      crm,
      booking: bookingSettings,
    });
  } catch (error) {
    console.error('[api/metrics] failed:', error);
    return NextResponse.json({ error: 'Failed to load metrics' }, { status: 500 });
  }
}