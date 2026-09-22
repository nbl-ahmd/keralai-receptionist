/**
 * crm/index.ts
 *
 * Pluggable CRM integration. Every provider implements the same adapter
 * contract, so swapping providers is an env change, not a code change.
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

export type CrmProvider = "none" | "webhook";

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

export interface CrmAdapter {
  readonly provider: CrmProvider;
  /** Push a contact + optional call/booking context to the CRM. */
  syncContact(payload: CrmContactPayload): Promise<CrmSyncResult>;
}

/** Returns the configured provider. */
export function getCrmProvider(): CrmProvider {
  const raw = (process.env.CRM_PROVIDER ?? "none").toLowerCase();
  return raw === "webhook" ? "webhook" : "none";
}

function describeConfig(): string {
  const provider = getCrmProvider();
  if (provider === "webhook" && !process.env.CRM_WEBHOOK_URL) {
    return "webhook (missing CRM_WEBHOOK_URL — sync disabled)";
  }
  return provider;
}

// ---------------------------------------------------------------------------
// Generic webhook adapter
// ---------------------------------------------------------------------------

const WEBHOOK_TIMEOUT_MS = 8000;

class WebhookCrmAdapter implements CrmAdapter {
  readonly provider: CrmProvider = "webhook";

  async syncContact(payload: CrmContactPayload): Promise<CrmSyncResult> {
    const url = process.env.CRM_WEBHOOK_URL;
    if (!url) {
      return { ok: false, provider: this.provider, skipped: true, error: "CRM_WEBHOOK_URL not set" };
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
      if (process.env.CRM_WEBHOOK_SECRET) {
        headers["X-KeralAI-Signature"] = process.env.CRM_WEBHOOK_SECRET;
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { ok: false, provider: this.provider, error: `HTTP ${response.status}` };
      }

      // Accept an optional external id from the CRM for future updates.
      let externalId: string | undefined;
      try {
        const data = (await response.json()) as { id?: string; contactId?: string };
        externalId = data.id ?? data.contactId;
      } catch {
        /* non-JSON response is fine */
      }

      return { ok: true, provider: this.provider, externalId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, provider: this.provider, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------------------------------------------------------------------------
// No-op adapter
// ---------------------------------------------------------------------------

class NoopCrmAdapter implements CrmAdapter {
  readonly provider: CrmProvider = "none";

  async syncContact(): Promise<CrmSyncResult> {
    return { ok: true, provider: this.provider, skipped: true };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getCrmAdapter(): CrmAdapter {
  return getCrmProvider() === "webhook" ? new WebhookCrmAdapter() : new NoopCrmAdapter();
}

/**
 * Syncs a contact (and optional call/booking context) to the CRM, recording the
 * attempt in crm_sync_events. Never throws — a CRM outage must not break a call.
 */
export async function syncToCrm(payload: CrmContactPayload): Promise<CrmSyncResult> {
  const adapter = getCrmAdapter();
  const provider = adapter.provider;

  if (provider === "none") {
    return { ok: true, provider, skipped: true };
  }

  const result = await adapter.syncContact(payload);

  try {
    await logCrmSyncEvent({
      contactId: payload.contact.id,
      provider,
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
      await updateContactCrmLink(payload.contact.id, provider, result.externalId);
    }
  } catch (error) {
    console.error("[crm] Failed to record sync event:", error);
  }

  return result;
}

/** Human-readable CRM status for the dashboard. */
export function getCrmStatus(): { provider: CrmProvider; description: string; configured: boolean } {
  const provider = getCrmProvider();
  return {
    provider,
    description: describeConfig(),
    configured: provider === "none" || Boolean(process.env.CRM_WEBHOOK_URL),
  };
}
