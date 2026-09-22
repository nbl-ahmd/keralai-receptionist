import { NextResponse } from 'next/server';
import { checkDatabase } from '@/db/client';

// Health must reflect live dependency state, never a cached response.
export const dynamic = 'force-dynamic';

/**
 * Liveness/readiness probe for deploys and uptime monitors.
 * Returns 503 when a dependency is unavailable so orchestrators can act on it.
 */
export async function GET() {
  const startedAt = Date.now();
  const database = await checkDatabase();

  const body = {
    status: database.ok ? 'ok' : 'degraded',
    uptimeSec: Math.round(process.uptime()),
    checks: {
      database: database.ok ? 'ok' : 'error',
      geminiKey: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
      browserKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY ? 'configured' : 'missing',
      crm: process.env.CRM_PROVIDER ?? 'none',
    },
    latencyMs: Date.now() - startedAt,
    ...(database.error ? { error: database.error } : {}),
  };

  return NextResponse.json(body, { status: database.ok ? 200 : 503 });
}