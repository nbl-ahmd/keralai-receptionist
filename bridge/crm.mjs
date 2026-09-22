/**
 * bridge/crm.mjs
 *
 * CRM sync for the phone bridge. Mirrors lib/crm/index.ts so phone calls are
 * pushed to the CRM exactly like browser calls are.
 *
 * Sync is intentionally best-effort: failures are logged but never thrown into
 * a live call path. Call syncToCrm() in a fire-and-forget chain after
 * sendToolResponse() so Maya is never blocked waiting for an external webhook.
 */

const TIMEOUT_MS = 8000;

export function getCrmProvider() {
  const raw = (process.env.CRM_PROVIDER ?? 'none').toLowerCase();
  return raw === 'webhook' ? 'webhook' : 'none';
}

/**
 * Pushes a contact plus call/booking context to the configured CRM webhook.
 * Never throws — CRM outages must not affect a live call.
 *
 * @param {{ contact: object, call?: object, appointment?: object, company?: object }} payload
 * @returns {Promise<{ ok: boolean, provider: string, externalId?: string, error?: string }>}
 */
export async function syncToCrm(payload) {
  const provider = getCrmProvider();
  if (provider === 'none') return { ok: true, provider, skipped: true };

  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return { ok: false, provider, skipped: true, error: 'CRM_WEBHOOK_URL not set' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.CRM_WEBHOOK_SECRET) {
      headers['X-KeralAI-Signature'] = process.env.CRM_WEBHOOK_SECRET;
    }

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
    });

    if (!response.ok) return { ok: false, provider, error: `HTTP ${response.status}` };

    let externalId;
    try {
      const data = await response.json();
      externalId = data.id ?? data.contactId;
    } catch {
      /* non-JSON responses are acceptable */
    }

    return { ok: true, provider, externalId };
  } catch (error) {
    return { ok: false, provider, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}
