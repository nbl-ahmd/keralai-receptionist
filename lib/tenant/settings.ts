/**
 * lib/tenant/settings.ts
 *
 * Per-tenant non-secret settings stored as jsonb in `tenant_settings`.
 *
 * Secret provider credentials live in tenant_secrets instead; this table only
 * holds configuration that is safe to render in the dashboard (model names,
 * CRM provider, webhook URL, etc.).
 *
 * Server-only.
 */

import { query, queryOne } from "@/db/client";

export async function getTenantSetting<T = unknown>(
  tenantId: string,
  key: string,
  fallback: T,
): Promise<T> {
  const row = await queryOne<{ value: T }>(
    `select value from tenant_settings where tenant_id = $1 and key = $2`,
    [tenantId, key],
  );
  if (!row) return fallback;
  return row.value ?? fallback;
}

export async function setTenantSetting(
  tenantId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await query(
    `insert into tenant_settings (tenant_id, key, value, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (tenant_id, key) do update set value = excluded.value, updated_at = now()`,
    [tenantId, key, JSON.stringify(value ?? null)],
  );
}

export async function deleteTenantSetting(tenantId: string, key: string): Promise<void> {
  await query(`delete from tenant_settings where tenant_id = $1 and key = $2`, [tenantId, key]);
}

export async function getTenantSettings(tenantId: string): Promise<Record<string, unknown>> {
  const rows = await query<{ key: string; value: unknown }>(
    `select key, value from tenant_settings where tenant_id = $1 order by key`,
    [tenantId],
  );
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

// Well-known setting keys, namespaced to keep future providers additive.
export const SETTING_KEYS = {
  geminiTextModel: "gemini.text_model",
  geminiLiveModel: "gemini.live_model",
  geminiEmbeddingModel: "gemini.embedding_model",
  crmProvider: "crm.provider",
  crmWebhookUrl: "crm.webhook_url",
  exotelSubdomain: "exotel.subdomain",
  exotelPhoneNumber: "exotel.phone_number",
} as const;
