import { transaction } from '@/db/transaction';
import { admitVoiceSession } from '@/bridge/entitlements.mjs';
import { limitOperation } from '@/lib/telephony/store';
import { getTenantGeminiApiKey } from '@/lib/gemini';
import { HttpError } from '@/lib/auth/context';
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
    const expected=new URL(process.env.BETTER_AUTH_URL??request.url).origin;
    if(request.headers.get('origin')!==expected)throw new HttpError(403,'Invalid request origin');
    await limitOperation(context.tenantId,'browser-session',6);
    if (!await getTenantGeminiApiKey(context.tenantId))
      throw new HttpError(503, 'AI is not configured yet. Check Advanced settings or contact your test organiser.');
    const {token,expiresAt}=await transaction(async c=>{
      const reservation=await admitVoiceSession(c,{tenantId:context.tenantId,userId:context.userId,kind:'browser'});
      return createBrowserBridgeToken(context,90,reservation.id);
    });
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
