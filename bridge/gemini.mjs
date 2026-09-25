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
import { getTenantSecretValue } from './secrets.mjs';
import { getTenantSetting } from './db.mjs';

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

  const apiKey = await getTenantGeminiApiKey(tenantId);
  if (!apiKey) {
    throw new Error('This workspace has no Gemini API key configured.');
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
