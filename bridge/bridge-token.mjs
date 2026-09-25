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

/**
 * Extracts the tenant routing token from an Exotel WebSocket upgrade request.
 *
 * Exotel does not reliably preserve arbitrary query parameters: its own docs
 * note that some parameter names arrive concatenated into a single malformed
 * key (`token=abc` coming back as `token:abc=`), and recommend Basic
 * Authentication because credentials are transmitted as a header rather than in
 * the URL. So we accept the token from, in order:
 *
 *   1. `?token=<token>` — the canonical shape.
 *   2. a malformed `?token:<token>=` key (Exotel concatenation quirk).
 *   3. `Authorization: Basic base64(<user>:<token>)` — Exotel's recommended
 *      channel, configured as `wss://tenant:<token>@host/ws/exotel/<slug>`.
 *   4. `/ws/exotel/<slug>/<token>` — a trailing path segment, since Exotel
 *      always preserves the path.
 *
 * Returns `{ token, source }`; `source` is safe to log (never the token).
 *
 * @param {URL} url
 * @param {Record<string, string | string[] | undefined>} [headers]
 * @returns {{ token: string, source: 'query' | 'query_malformed' | 'basic_auth' | 'path' | 'none' }}
 */
export function extractExotelToken(url, headers = {}) {
  const direct = url.searchParams.get('token');
  if (direct) return { token: direct, source: 'query' };

  for (const [key] of url.searchParams) {
    if (key.startsWith('token:')) {
      const embedded = key.slice('token:'.length).replace(/=+$/, '');
      if (embedded) return { token: embedded, source: 'query_malformed' };
    }
  }

  const auth = headers.authorization ?? headers.Authorization;
  if (typeof auth === 'string' && /^basic\s+/i.test(auth)) {
    try {
      const decoded = Buffer.from(auth.replace(/^basic\s+/i, '').trim(), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const username = separator >= 0 ? decoded.slice(0, separator) : decoded;
      const password = separator >= 0 ? decoded.slice(separator + 1) : '';
      // Prefer the password (our documented shape); fall back to the username
      // so a URL like wss://<token>@host/... also works.
      const token = password || username;
      if (token) return { token, source: 'basic_auth' };
    } catch {
      /* malformed header — treat as no token */
    }
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'ws' && segments[1] === 'exotel' && segments[3]) {
    return { token: decodeURIComponent(segments[3]), source: 'path' };
  }

  return { token: '', source: 'none' };
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
