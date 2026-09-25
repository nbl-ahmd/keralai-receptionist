import { NextResponse } from 'next/server';
import { createBrowserBridgeToken } from '@/lib/tenant/bridge-token';
import { handleApiError, resolveTenantContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

/** Resolves the bridge's public WebSocket origin for browser sessions. */
function bridgeWsBase(): string | null {
  const raw = process.env.PUBLIC_BRIDGE_WS_URL || process.env.NEXT_PUBLIC_BRIDGE_WS_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, '').replace(/^http/, 'ws').replace(/^https/, 'wss');
}

/**
 * Issues a short-lived signed bridge token for the authenticated browser voice
 * session. The tenant is resolved from the session — never from client input.
 */
export async function POST(request: Request) {
  try {
    const context = await resolveTenantContext(request);
    const { token, expiresAt } = createBrowserBridgeToken(context, 300);
    const base = bridgeWsBase();
    return NextResponse.json({
      token,
      expiresAt,
      // null means same-origin; the client falls back to window.location.
      wsUrl: base ? `${base}/ws/browser` : null,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to start a voice session');
  }
}
