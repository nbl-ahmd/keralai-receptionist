/**
 * lib/tenant/bridge-url.ts
 *
 * Per-tenant Exotel WebSocket routing helpers.
 *
 * The Exotel applet connects to `/ws/exotel/:tenantSlug?token=...`. Only a
 * SHA-256 hash of the token is stored (tenant_bridge_credentials); the plaintext
 * token is shown to the owner exactly once, when it is generated or rotated.
 *
 * Server-only.
 */

import crypto from "node:crypto";
import { queryOne } from "@/db/client";

export interface ExotelCredential {
  configured: boolean;
  tokenLast4: string | null;
  rotatedAt: string | null;
}

/** Generates a URL-safe random token. */
export function generateExotelToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function hashExotelToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyExotelToken(token: string, storedHash: string): boolean {
  if (!token || !storedHash) return false;
  const computed = Buffer.from(hashExotelToken(token));
  const stored = Buffer.from(storedHash);
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

export async function getExotelCredential(tenantId: string): Promise<ExotelCredential> {
  const row = await queryOne<{ token_last4: string | null; rotated_at: string | null; token_hash: string | null }>(
    `select token_last4, rotated_at, token_hash from tenant_bridge_credentials where tenant_id = $1`,
    [tenantId],
  );
  if (!row || !row.token_hash) {
    return { configured: false, tokenLast4: null, rotatedAt: null };
  }
  return { configured: true, tokenLast4: row.token_last4, rotatedAt: row.rotated_at };
}

/** Stores (or rotates) the hashed token and returns the plaintext once. */
export async function rotateExotelCredential(tenantId: string): Promise<{
  token: string;
  tokenLast4: string;
  rotatedAt: string;
}> {
  const token = generateExotelToken();
  const tokenHash = hashExotelToken(token);
  const tokenLast4 = token.slice(-4);
  const row = await queryOne<{ rotated_at: string }>(
    `insert into tenant_bridge_credentials (tenant_id, token_hash, token_last4, rotated_at)
     values ($1, $2, $3, now())
     on conflict (tenant_id) do update set
       token_hash = excluded.token_hash,
       token_last4 = excluded.token_last4,
       rotated_at = now()
     returning rotated_at`,
    [tenantId, tokenHash, tokenLast4],
  );
  return { token, tokenLast4, rotatedAt: row?.rotated_at ?? new Date().toISOString() };
}

/**
 * Builds the public WebSocket URL for a tenant's Exotel applet.
 * Without a token, returns the URL with a placeholder (never a real secret).
 */
export function buildExotelWsUrl(
  tenantSlug: string,
  token?: string,
  query: Record<string, string> = {},
): string {
  const base =
    process.env.PUBLIC_BRIDGE_WS_URL ||
    process.env.NEXT_PUBLIC_BRIDGE_WS_URL ||
    "wss://your-bridge-host.onrender.com";
  const root = base.replace(/\/+$/, "").replace(/^http/, "ws").replace(/^https/, "wss");
  const params = new URLSearchParams({ ...query });
  if (token) params.set("token", token);
  const qs = params.toString();
  return `${root}/ws/exotel/${tenantSlug}${qs ? `?${qs}` : ""}`;
}

/** Verifies a presented Exotel token for a tenant slug, server-side. */
export async function resolveTenantByExotelToken(
  tenantSlug: string,
  token: string,
): Promise<{ tenantId: string } | null> {
  const row = await queryOne<{ id: string; token_hash: string | null }>(
    `select t.id, c.token_hash
       from tenants t
       left join tenant_bridge_credentials c on c.tenant_id = t.id
      where t.slug = $1`,
    [tenantSlug],
  );
  if (!row || !row.token_hash) return null;
  if (!verifyExotelToken(token, row.token_hash)) return null;
  return { tenantId: row.id };
}
