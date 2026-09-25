/**
 * crm/index.ts
 *
 * Pluggable CRM integration. Configuration is per-tenant: the provider and
 * webhook URL come from `tenant_settings`, the optional signing secret from the
 * encrypted `tenant_secrets` table. There is no process-wide CRM default.
 *
 * Supported:
 *   - webhook  (generic HTTP POST — HubSpot, Zoho, Zapier, n8n, Make, custom)
 *   - none     (disabled; calls are still stored locally)
 *
 * Sync is best-effort: failures are recorded in crm_sync_events and never break
 * a live call or a booking.
 */

import { Appointment, CallRecord, CompanyProfile } from "../../types";
import { Contact, logCrmSyncEvent, updateContactCrmLink } from "../store";
import { getTenantSetting, SETTING_KEYS } from "../tenant/settings";
import { getTenantSecretValue } from "../tenant/secrets";

export type CrmProvider = "none" | "webhook";

export interface CrmConfig {
  provider: CrmProvider;
  webhookUrl: string | null;
  webhookSecret: string | null;
  configured: boolean;
}

export interface CrmSyncResult {
  ok: boolean;
  provider: CrmProvider;
  externalId?: string;
  skipped?: boolean;
  error?: string;
}

export interface CrmContactPayload {
  contact: Contact;
  call?: Pick<CallRecord, "callSid" | "intent" | "outcome" | "summary" | "durationSec" | "startedAt">;
  appointment?: Pick<Appointment, "date" | "time" | "reason" | "status">;
  company?: CompanyProfile;
}

/** Loads the tenant's CRM configuration (never logs the secret). */
export async function getCrmConfig(tenantId: string): Promise<CrmConfig> {
  const [rawProvider, rawUrl, secret] = await Promise.all([
    getTenantSetting<string>(tenantId, SETTING_KEYS.crmProvider, "none"),
    getTenantSetting<string>(tenantId, SETTING_KEYS.crmWebhookUrl, ""),
    getTenantSecretValue(tenantId, "crm", "webhook_secret"),
  ]);

  const provider: CrmProvider = String(rawProvider).toLowerCase() === "webhook" ? "webhook" : "none";
  const webhookUrl = rawUrl?.trim() ? rawUrl.trim() : null;

  return {
    provider,
    webhookUrl,
    webhookSecret: secret,
    configured: provider !== "none" && Boolean(webhookUrl),
  };
}

// ---------------------------------------------------------------------------
// Generic webhook adapter
// ---------------------------------------------------------------------------

const WEBHOOK_TIMEOUT_MS = 8000;

async function postToWebhook(
  config: CrmConfig,
  payload: CrmContactPayload,
): Promise<CrmSyncResult> {
  if (!config.webhookUrl) {
    return { ok: false, provider: config.provider, skipped: true, error: "Webhook URL not configured" };
  }

  const body = {
    event: payload.appointment ? "contact.appointment_booked" : "contact.call_completed",
    contact: {
      id: payload.contact.id,
      name: payload.contact.name,
      phone: payload.contact.phone,
      email: payload.contact.email,
      company: payload.contact.company,
      source: payload.contact.source,
      lastContactAt: payload.contact.lastContactAt,
    },
    call: payload.call ?? null,
    appointment: payload.appointment ?? null,
    company: payload.company
      ? { name: payload.company.name, industry: payload.company.industry, phone: payload.company.contactPhone }
      : null,
    sentAt: new Date().toISOString(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.webhookSecret) {
      headers["X-KeralAI-Signature"] = config.webhookSecret;
    }

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, provider: config.provider, error: `HTTP ${response.status}` };
    }

    // Accept an optional external id from the CRM for future updates.
    let externalId: string | undefined;
    try {
      const data = (await response.json()) as { id?: string; contactId?: string };
      externalId = data.id ?? data.contactId;
    } catch {
      /* non-JSON response is fine */
    }

    return { ok: true, provider: config.provider, externalId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, provider: config.provider, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Syncs a contact (and optional call/booking context) to the tenant's CRM,
 * recording the attempt in crm_sync_events. Never throws — a CRM outage must
 * not break a call.
 */
export async function syncToCrm(
  tenantId: string,
  payload: CrmContactPayload,
): Promise<CrmSyncResult> {
  let config: CrmConfig;
  try {
    config = await getCrmConfig(tenantId);
  } catch (error) {
    return {
      ok: false,
      provider: "none",
      skipped: true,
      error: error instanceof Error ? error.message : "CRM configuration unavailable",
    };
  }

  if (config.provider === "none") {
    return { ok: true, provider: "none", skipped: true };
  }

  const result = await postToWebhook(config, payload);

  try {
    await logCrmSyncEvent(tenantId, {
      contactId: payload.contact.id,
      provider: config.provider,
      direction: "push",
      status: result.ok ? (result.skipped ? "skipped" : "success") : "failed",
      payload: {
        event: payload.appointment ? "appointment_booked" : "call_completed",
        callSid: payload.call?.callSid,
        appointment: payload.appointment ?? null,
      },
      error: result.error,
    });

    if (result.ok && result.externalId) {
      await updateContactCrmLink(tenantId, payload.contact.id, config.provider, result.externalId);
    }
  } catch (error) {
    console.error("[crm] Failed to record sync event:", error);
  }

  return result;
}

/** Human-readable CRM status for the dashboard. Never exposes the secret. */
export async function getCrmStatus(
  tenantId: string,
): Promise<{ provider: CrmProvider; description: string; configured: boolean }> {
  const config = await getCrmConfig(tenantId);
  const description =
    config.provider === "none"
      ? "none"
      : config.webhookUrl
        ? "webhook"
        : "webhook (missing webhook URL — sync disabled)";
  return { provider: config.provider, description, configured: config.configured };
}
