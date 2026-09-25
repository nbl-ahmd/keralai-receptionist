import { NextResponse } from 'next/server';
import { getMetrics } from '@/lib/store';
import { getCrmStatus } from '@/lib/crm';
import { bookingSettings } from '@/lib/booking';
import { resolveTenantContext, handleApiError } from '@/lib/auth/context';

// Metrics change with every call; never serve a cached snapshot.
export const dynamic = 'force-dynamic';

/** Aggregated dashboard metrics computed in Postgres, scoped to the tenant. */
export async function GET(request: Request) {
  try {
    const { tenantId } = await resolveTenantContext(request);
    const [metrics, crm] = await Promise.all([
      getMetrics(tenantId),
      getCrmStatus(tenantId),
    ]);
    return NextResponse.json({
      metrics,
      crm,
      booking: bookingSettings,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to load metrics');
  }
}
