import { NextResponse } from 'next/server';
import { checkDatabase } from '@/db/client';
import { getEncryptionKeyFingerprint } from '@/lib/tenant/secrets';

// Health must reflect live dependency state, never a cached response.
export const dynamic = 'force-dynamic';

/**
 * Liveness/readiness probe for deploys and uptime monitors.
 * Returns 503 when a dependency is unavailable so orchestrators can act on it.
 *
 * Deliberately unauthenticated, so it reports only coarse configuration
 * presence — never values, hosts, or provider credentials. The secrets key
 * fingerprint is a non-reversible hash prefix (see getEncryptionKeyFingerprint)
 * and exists solely so an operator can compare this process against the
 * bridge's /health.
 */
export async function GET() {
  const startedAt = Date.now();
  const database = await checkDatabase();

  const body = {
    status: database.ok ? 'ok' : 'degraded',
    uptimeSec: Math.round(process.uptime()),
    checks: {
      database: database.ok ? 'ok' : 'error',
      auth: process.env.BETTER_AUTH_SECRET ? 'configured' : 'missing',
      bridgeAuth: process.env.BRIDGE_AUTH_SECRET ? 'configured' : 'missing',
      secretsEncryption: process.env.TENANT_SECRETS_ENCRYPTION_KEY ? 'configured' : 'missing',
      // Non-secret: compare with the bridge's /health to confirm both processes
      // derived the same TENANT_SECRETS_ENCRYPTION_KEY.
      secretsKeyFingerprint: getEncryptionKeyFingerprint(),
    },
    latencyMs: Date.now() - startedAt,
    // Never expose the raw database error outside development.
    ...(database.error && process.env.NODE_ENV === 'development' ? { error: database.error } : {}),
  };

  return NextResponse.json(body, { status: database.ok ? 200 : 503 });
}
