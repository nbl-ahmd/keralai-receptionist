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
 * clients are short-lived so a rotated key takes effect automatically.
 */

import { GoogleGenAI } from '@google/genai';
import { getTenantSecretValue, saveTenantSecret } from './secrets.mjs';
import { getLegacyTenant, getTenantSetting } from './db.mjs';

export const DEFAULT_LIVE_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-live';
export const DEFAULT_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-2';

const CACHE_TTL_MS = 60_000;

/** @type {Map<string, { value: GoogleGenAI, expiresAt: number }>} */
const clientCache = new Map();

/** Returns the tenant's decrypted Gemini API key, or null when unconfigured. */
export async function getTenantGeminiApiKey(tenantId) {
  return getTenantSecretValue(tenantId, 'gemini', 'api_key');
}

/**
 * Builds (and briefly caches) a Gemini client scoped to one tenant.
 * Throws when the tenant has not configured a key.
 */
export async function getTenantGeminiClient(tenantId) {
  const cached = clientCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let apiKey;
  try {
    apiKey = await getTenantGeminiApiKey(tenantId);
  } catch (error) {
    // A decryption failure almost always means the bridge's
    // TENANT_SECRETS_ENCRYPTION_KEY does not match the dashboard's. Surface a
    // clear, actionable error (never the ciphertext or the key).
    const failure = new Error(
      'The workspace Gemini credential could not be decrypted. TENANT_SECRETS_ENCRYPTION_KEY ' +
        'must be identical on the dashboard and the bridge; re-save the key after fixing it.',
    );
    failure.code = 'TENANT_SECRET_DECRYPT_FAILED';
    failure.cause = error;
    throw failure;
  }
  if (!apiKey) {
    const missing = new Error('This workspace has no Gemini API key configured.');
    missing.code = 'TENANT_GEMINI_KEY_MISSING';
    throw missing;
  }
  const client = new GoogleGenAI({ apiKey });
  clientCache.set(tenantId, { value: client, expiresAt: Date.now() + CACHE_TTL_MS });
  return client;
}

/** Drops a cached client so a rotated key is picked up immediately. */
export function invalidateTenantGeminiClient(tenantId) {
  clientCache.delete(tenantId);
}

async function resolveModel(tenantId, key, fallback) {
  const value = await getTenantSetting(tenantId, key, '');
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

/** Tenant-configured Gemini Live model, falling back to the env/default. */
export async function getTenantLiveModel(tenantId) {
  return resolveModel(tenantId, 'gemini.live_model', DEFAULT_LIVE_MODEL);
}

/** Tenant-configured embedding model, falling back to the env/default. */
export async function getTenantEmbeddingModel(tenantId) {
  return resolveModel(tenantId, 'gemini.embedding_model', DEFAULT_EMBEDDING_MODEL);
}

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
 * traffic still resolves credentials from `tenant_secrets` only. Never logs the
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
