/**
 * lib/tenant/bridge-token.ts
 *
 * Short-lived, stateless HMAC-SHA256 tokens used to authorise browser voice
 * sessions against the standalone bridge.
 *
 * The Vercel app signs a token after authenticating the user and resolving the
 * tenant. The bridge verifies the signature and expiry before creating a
 * BrowserSession. A client-supplied `?tenantId=` is never trusted.
 *
 * Token format: base64url(payloadJson).base64url(hmac)
 *
 * Server-only (uses node:crypto).
 */

import crypto from "node:crypto";
import type { TenantContext } from "./types";

export type BridgeScope = "browser" | "exotel";

export interface BridgeTokenPayload {
  /** subject: user id */
  sub: string;
  /** tenant id */
  tid: string;
  scope: BridgeScope;
  /** unix seconds */
  exp: number;
  /** issued at, unix seconds */
  iat: number;
  /** random nonce, to avoid identical tokens */
  nonce: string;
}

function getSecret(): string {
  const secret = process.env.BRIDGE_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BRIDGE_AUTH_SECRET is not set. It must be identical on Vercel and Render.",
    );
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export function signBridgeToken(
  payload: Omit<BridgeTokenPayload, "iat" | "nonce"> & { nonce?: string; iat?: number },
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: BridgeTokenPayload = {
    ...payload,
    iat: payload.iat ?? now,
    nonce: payload.nonce ?? crypto.randomBytes(12).toString("base64url"),
  };
  const body = base64url(JSON.stringify(full));
  return `${body}.${sign(body, getSecret())}`;
}

export function createBrowserBridgeToken(
  context: Pick<TenantContext, "userId" | "tenantId">,
  ttlSeconds = 300,
): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const token = signBridgeToken({
    sub: context.userId,
    tid: context.tenantId,
    scope: "browser",
    exp,
  });
  return { token, expiresAt: exp };
}

export type VerifyResult =
  | { ok: true; payload: BridgeTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyBridgeToken(token: string, expectedScope?: BridgeScope): VerifyResult {
  if (!token || typeof token !== "string") return { ok: false, reason: "malformed" };
  const [body, signature] = token.split(".");
  if (!body || !signature) return { ok: false, reason: "malformed" };

  const expected = sign(body, getSecret());
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: BridgeTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !payload ||
    typeof payload.sub !== "string" ||
    typeof payload.tid !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.scope !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (expectedScope && payload.scope !== expectedScope) {
    return { ok: false, reason: "bad_signature" };
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}
