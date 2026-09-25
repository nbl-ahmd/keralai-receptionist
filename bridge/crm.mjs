/**
 * bridge/crm.mjs
 *
 * Tenant-scoped CRM sync for the phone bridge. Mirrors lib/crm/index.ts so phone
 * calls are pushed to the CRM exactly like browser calls are.
 *
 * There is no process-wide CRM configuration: the provider, webhook URL and
 * signing secret are resolved per tenant from `tenant_settings` / `tenant_secrets`
 * before any request is made.
 *
 * Sync is intentionally best-effort: failures are logged but never thrown into
 * a live call path. Call syncToCrm() in a fire-and-forget chain after
 * sendToolResponse() so the assistant is never blocked waiting for a webhook.
 */

import { hrNow, logPerf, msSince, processMetrics } from './metrics.mjs';
import { getTenantSetting } from './db.mjs';
import { getTenantSecretValue } from './secrets.mjs';
import { assertSafeWebhookUrl } from './safe-webhook-url.mjs';

const TIMEOUT_MS = Number(process.env.CRM_TIMEOUT_MS ?? 8000);

export const CRM_PROVIDER_KEY = 'crm.provider';
export const CRM_WEBHOOK_URL_KEY = 'crm.webhook_url';

/**
 * Resolves the tenant's CRM configuration. Returns `{ provider, url, secret }`.
 * `provider` is `'none'` unless the tenant explicitly configured a webhook.
 */
export async function getCrmConfig(tenantId) {
  let provider = 'none';
  let url = null;
  try {
    const raw = await getTenantSetting(tenantId, CRM_PROVIDER_KEY, 'none');
    provider = String(raw ?? 'none').toLowerCase() === 'webhook' ? 'webhook' : 'none';
    url = await getTenantSetting(tenantId, CRM_WEBHOOK_URL_KEY, null);
    url = typeof url === 'string' && url.trim() ? url.trim() : null;
  } catch (error) {
    console.error('[bridge][crm] Failed to load CRM settings:', error?.message ?? error);
    return { provider: 'none', url: null, secret: null };
  }
  if (provider === 'none' || !url) return { provider: 'none', url: null, secret: null };

  let secret = null;
  try {
    secret = await getTenantSecretValue(tenantId, 'crm', 'webhook_secret');
  } catch (error) {
    // A missing/broken encryption key must not block the call; sync unsigned.
    console.error('[bridge][crm] Failed to load CRM secret:', error?.message ?? error);
  }
  return { provider, url, secret };
}

/** Convenience helper for call sites that only need the provider name. */
export async function getCrmProvider(tenantId) {
  return (await getCrmConfig(tenantId)).provider;
}

/**
 * Pushes a contact plus call/booking context to the tenant's CRM webhook.
 * Never throws — CRM outages must not affect a live call.
 *
 * @param {string} tenantId
 * @param {{ contact: object, call?: object, appointment?: object, company?: object }} payload
 * @returns {Promise<{ ok: boolean, provider: string, externalId?: string, error?: string, skipped?: boolean }>}
 */
export async function syncToCrm(tenantId, payload) {
  const config = await getCrmConfig(tenantId);
  if (config.provider === 'none' || !config.url) {
    return { ok: true, provider: 'none', skipped: true };
  }
  const { provider, url, secret } = config;

  // Reject SSRF targets (metadata, private/loopback/link-local) before fetching.
  const safeUrl = await assertSafeWebhookUrl(url);
  if (!safeUrl.ok) {
    return { ok: false, provider, skipped: true, error: `Webhook URL blocked (${safeUrl.reason})` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedNs = hrNow();
  let ok = false;

  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (secret) headers['X-KeralAI-Signature'] = secret;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: payload.appointment ? 'contact.appointment_booked' : 'contact.call_completed',
        contact: payload.contact ?? null,
        call: payload.call ?? null,
        appointment: payload.appointment ?? null,
        company: payload.company ?? null,
        sentAt: new Date().toISOString(),
      }),
      signal: controller.signal,
      // Block redirect-based SSRF: validation above only covers this URL.
      redirect: 'error',
    });

    if (!response.ok) return { ok: false, provider, error: `HTTP ${response.status}` };

    let externalId;
    try {
      const data = await response.json();
      externalId = data.id ?? data.contactId;
    } catch {
      /* non-JSON responses are acceptable */
    }

    ok = true;
    return { ok: true, provider, externalId };
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `request timed out after ${TIMEOUT_MS}ms`
      : (error?.message ?? String(error));
    return { ok: false, provider, error: message };
  } finally {
    clearTimeout(timeout);
    const ms = msSince(startedNs);
    processMetrics.crmLatency.record(ms);
    if (ok) processMetrics.crmSyncs++;
    else processMetrics.crmFailures++;
    logPerf('crm', { provider, dur_ms: ms.toFixed(1), ok: ok ? 1 : 0 });
  }
}
