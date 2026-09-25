/**
 * lib/gemini.ts
 *
 * Per-tenant Gemini client resolution.
 *
 * There is deliberately no process-wide `GoogleGenAI` instance for tenant
 * traffic: the tenant is resolved first, then its credential is decrypted and
 * used to build a client. A platform-level key is never used as a fallback for
 * tenant requests.
 *
 * Server-only.
 */

import { GoogleGenAI } from "@google/genai";
import { getTenantSecretValue } from "./tenant/secrets";
import { getTenantSetting, SETTING_KEYS } from "./tenant/settings";

export const DEFAULT_TEXT_MODEL = process.env.GENAI_MODEL || "gemini-flash-lite-latest";
export const DEFAULT_LIVE_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-live";
export const DEFAULT_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const clientCache = new Map<string, CacheEntry<GoogleGenAI>>();
const keyCache = new Map<string, CacheEntry<string | null>>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): T {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateTenantGeminiCache(tenantId: string): void {
  clientCache.delete(tenantId);
  keyCache.delete(tenantId);
}

/** Returns the tenant's decrypted Gemini API key, or null when not configured. */
export async function getTenantGeminiApiKey(tenantId: string): Promise<string | null> {
  const cached = getCached(keyCache, tenantId);
  if (cached !== undefined) return cached;
  const key = await getTenantSecretValue(tenantId, "gemini", "api_key");
  return setCached(keyCache, tenantId, key);
}

/** Builds (and caches briefly) a Gemini client scoped to one tenant. */
export async function getTenantGeminiClient(tenantId: string): Promise<GoogleGenAI> {
  const cached = getCached(clientCache, tenantId);
  if (cached) return cached;
  const apiKey = await getTenantGeminiApiKey(tenantId);
  if (!apiKey) {
    throw new Error(
      "This workspace has no Gemini API key configured. Add one in Settings → Providers.",
    );
  }
  return setCached(clientCache, tenantId, new GoogleGenAI({ apiKey }));
}

export async function getTenantTextModel(tenantId: string): Promise<string> {
  const value = await getTenantSetting<string>(tenantId, SETTING_KEYS.geminiTextModel, "");
  return value?.trim() || DEFAULT_TEXT_MODEL;
}

export async function getTenantLiveModel(tenantId: string): Promise<string> {
  const value = await getTenantSetting<string>(tenantId, SETTING_KEYS.geminiLiveModel, "");
  return value?.trim() || DEFAULT_LIVE_MODEL;
}

export async function getTenantEmbeddingModel(tenantId: string): Promise<string> {
  const value = await getTenantSetting<string>(tenantId, SETTING_KEYS.geminiEmbeddingModel, "");
  return value?.trim() || DEFAULT_EMBEDDING_MODEL;
}
