import { NextResponse } from 'next/server';
import { getCallMetrics, getCallMetricsSummary } from '@/lib/store';

// Metrics change with every call; never serve a cached snapshot.
export const dynamic = 'force-dynamic';

/**
 * Real per-call performance metrics persisted by the bridge at call end.
 * Returns a platform-wide summary plus the most recent calls.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requested = Number(searchParams.get('limit'));
    const limit = Number.isFinite(requested) && requested > 0 ? requested : 100;

    const [summary, calls] = await Promise.all([getCallMetricsSummary(), getCallMetrics(limit)]);
    return NextResponse.json({ summary, calls });
  } catch (error) {
    console.error('[api/call-metrics] failed:', error);
    return NextResponse.json({ error: 'Failed to load call metrics' }, { status: 500 });
  }
}
