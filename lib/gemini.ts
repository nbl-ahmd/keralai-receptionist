/**
 * lib/gemini.ts
 *
 * Per-tenant Gemini client resolution.
 *
 * There is deliberately no process-wide `GoogleGenAI` instance for tenant
 * traffic: the tenant is resolved first, then its credential is decrypted and
 * used to build a client. Closed-alpha platform mode is an explicit operator-selected credential mode,
 * with tenant eligibility and daily allowances checked before use.
 *
 * Server-only.
 */

import { transaction } from '@/db/transaction';
import { reserveAiRequest } from '@/bridge/entitlements.mjs';
import { query } from "@/db/client";
import { resolveTenantAiConfiguration as resolveAi } from "@/bridge/ai-config.mjs";
import { GoogleGenAI } from "@google/genai";
import { getTenantSecretValue } from "./tenant/secrets";


export const DEFAULT_TEXT_MODEL = process.env.GENAI_MODEL || "gemini-flash-lite-latest";
export const DEFAULT_LIVE_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-live";
export const DEFAULT_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2";

export async function resolveTenantAiConfiguration(tenantId: string, consume = false) {
  const config=await resolveAi(tenantId, { query, readSecret: getTenantSecretValue, consume });
  if(consume)await reserveAiRequest(tenantId,'ai_request',transaction);
  return config;
}
export function invalidateTenantGeminiCache(tenantId: string): void { void tenantId; /* Fresh resolution handles revocation/rotation. */ }
export async function getTenantGeminiApiKey(tenantId: string): Promise<string | null> {
  return (await resolveTenantAiConfiguration(tenantId)).apiKey;
}
export async function getTenantGeminiClient(tenantId: string): Promise<GoogleGenAI> {
  const config = await resolveTenantAiConfiguration(tenantId, true);
  return new GoogleGenAI({ apiKey: config.apiKey! });
}
export async function getTenantTextModel(tenantId: string): Promise<string> { return (await resolveTenantAiConfiguration(tenantId)).textModel; }
export async function getTenantLiveModel(tenantId: string): Promise<string> { return (await resolveTenantAiConfiguration(tenantId)).liveModel; }
export async function getTenantEmbeddingModel(tenantId: string): Promise<string> { return (await resolveTenantAiConfiguration(tenantId)).embeddingModel; }

/** Non-secret display metadata remains available when voice/account access is paused. */
export async function isPlatformManagedAi(tenantId: string): Promise<boolean> {
  const rows=await query<{credential_mode:string}>('select credential_mode from tenant_ai_configuration where tenant_id=$1',[tenantId]);
  return rows[0]?.credential_mode==='platform_managed';
}
