/**
 * bridge/gemini.mjs
 *
 * Per-tenant Gemini client + model resolution for the standalone bridge.
 *
 * Mirrors lib/gemini.ts on the dashboard side. There is deliberately no
 * process-wide GoogleGenAI instance for tenant traffic: the tenant is resolved
 * first (from the Exotel URL token or a signed browser bridge token), then its
 * encrypted credential is decrypted and used to build a client.
 *
 * Decrypted keys are never logged and never returned to a browser. Cached
 * clients resolve fresh so a rotated key takes effect on the next session.
 */

import { reserveAiRequest } from './entitlements.mjs';
import { AlphaAccessError } from './alpha-policy.mjs';
import { GoogleGenAI } from '@google/genai';
import { getTenantSecretValue, saveTenantSecret } from './secrets.mjs';
import { resolveTenantAiConfiguration as resolveAi } from './ai-config.mjs';
import { dbQuery, getLegacyTenant, withTransaction } from './db.mjs';

export const DEFAULT_LIVE_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-live';
export const DEFAULT_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-2';

export async function resolveTenantAiConfiguration(tenantId, consume = false) {
  return resolveAi(tenantId, { query: dbQuery, readSecret: getTenantSecretValue, consume });
}
export async function getTenantGeminiApiKey(tenantId) { return (await resolveTenantAiConfiguration(tenantId)).apiKey; }
export async function getTenantGeminiClient(tenantId, sessionId=null) {
  if(sessionId) {
    const active=await dbQuery("select 1 from alpha_voice_sessions where tenant_id=$1 and id=$2 and state='active' and expires_at>now()",[tenantId,sessionId]);
    if(!active.length)throw new AlphaAccessError(403,'Voice authorization is unavailable.');
  }
  const config = await resolveTenantAiConfiguration(tenantId, true);
  if(!sessionId)await reserveAiRequest(tenantId,'bridge_ai_request',withTransaction);
  return new GoogleGenAI({ apiKey: config.apiKey });
}
export function invalidateTenantGeminiClient() { /* All selections are fresh. */ }
export async function getTenantLiveModel(tenantId) { return (await resolveTenantAiConfiguration(tenantId)).liveModel; }
export async function getTenantEmbeddingModel(tenantId) { return (await resolveTenantAiConfiguration(tenantId)).embeddingModel; }

/**
 * One-time migration of the pre-multitenancy Gemini key into the legacy tenant.
 *
 * Before multitenancy the bridge used a single process-wide `GEMINI_API_KEY`.
 * After the migration every tenant must carry its own encrypted key, so the
 * legacy tenant has none and its phone calls fail closed ("No Gemini credential
 * for tenant ..."). When `LEGACY_GEMINI_API_KEY` (or, as a fallback, the old
 * `GEMINI_API_KEY`) is set, this imports it into the legacy tenant exactly once,
 * encrypted at rest, so existing deployments keep working.
 *
 * This is a migration write, not a per-request global fallback: ordinary tenant
 * traffic uses the explicit tenant AI mode. Never logs the
 * key.
 */
export async function importLegacyGeminiKeyIfNeeded() {
  const source = (process.env.LEGACY_GEMINI_API_KEY ?? '').trim();
  const legacyKey = source || (process.env.GEMINI_API_KEY ?? '').trim();
  if (!legacyKey) return null;

  const legacy = await getLegacyTenant();
  if (!legacy) return null;

  let existing;
  try {
    existing = await getTenantSecretValue(legacy.id, 'gemini', 'api_key');
  } catch (error) {
    // The row exists but cannot be decrypted (master-key mismatch). Do not
    // overwrite it — the dashboard that wrote it may be using a different key;
    // the operator must align TENANT_SECRETS_ENCRYPTION_KEY first.
    console.error(
      `[bridge] legacy tenant "${legacy.slug}" Gemini key is stored but undecryptable ` +
        '(TENANT_SECRETS_ENCRYPTION_KEY mismatch); not overwriting.',
    );
    return { slug: legacy.slug, imported: false, undecryptable: true };
  }
  if (existing) return { slug: legacy.slug, imported: false };

  await saveTenantSecret({
    tenantId: legacy.id,
    provider: 'gemini',
    keyName: 'api_key',
    value: legacyKey,
  });
  return { slug: legacy.slug, imported: true };
}
