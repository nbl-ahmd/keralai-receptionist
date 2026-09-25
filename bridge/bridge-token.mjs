/**
 * bridge/bridge-token.mjs
 *
 * Verification of the short-lived, stateless HMAC-SHA256 browser bridge tokens
 * issued by the dashboard (lib/tenant/bridge-token.ts).
 *
 * Format: base64url(payloadJson).base64url(hmac)
 *
 * The bridge validates the signature and expiry before creating a
 * BrowserSession. A client-supplied `?tenantId=` is never trusted; the tenant
 * always comes from the signed `tid` claim.
 */

import crypto from 'node:crypto';

/** SHA-256 hash of an Exotel token, matching lib/tenant/bridge-url.ts. */
export function hashExotelToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of a presented Exotel token against the stored hash.
 * Returns false when either value is missing.
 */
export function verifyExotelToken(token, storedHash) {
  if (!token || !storedHash) return false;
  const computed = Buffer.from(hashExotelToken(token));
  const stored = Buffer.from(storedHash);
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

function getSecret() {
  const secret = process.env.BRIDGE_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'BRIDGE_AUTH_SECRET is not set. It must be identical on Vercel and Render.',
    );
  }
  return secret;
}

function sign(data, secret) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * @param {string} token
 * @param {'browser'|'exotel'} [expectedScope]
 * @returns {{ ok: true, payload: object } | { ok: false, reason: string }}
 */
export function verifyBridgeToken(token, expectedScope) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, reason: 'malformed' };

  const expected = sign(body, getSecret());
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    typeof payload.tid !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.scope !== 'string'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (expectedScope && payload.scope !== expectedScope) {
    return { ok: false, reason: 'bad_signature' };
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}
