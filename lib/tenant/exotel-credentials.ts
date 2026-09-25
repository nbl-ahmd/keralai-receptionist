/**
 * lib/tenant/exotel-credentials.ts
 *
 * Per-tenant Exotel account credentials, decrypted on demand for trusted server
 * code only. Values are never serialised to a browser response.
 *
 * The inbound phone bridge does NOT need these: Exotel dials the tenant's
 * WebSocket URL and the bridge authenticates the call with the per-tenant
 * routing token (`tenant_bridge_credentials`). Instead, these credentials let
 * the platform act on the tenant's *own* Exotel account over the REST API — for
 * example listing the tenant's ExoPhones, or (later) placing outbound calls.
 *
 * That is what lets every tester bring their own Exotel account, number and
 * trial quota: the account is stored per tenant and read per tenant, never from
 * a global environment variable or a shared platform account.
 *
 * Server-only.
 */

import { getTenantSecretValue } from "@/lib/tenant/secrets";
import { getTenantSetting } from "@/lib/tenant/settings";

export const EXOTEL_SECRET_KEYS = {
  accountSid: "account_sid",
  apiKey: "api_key",
  apiToken: "api_token",
  appId: "app_id",
} as const;

export const EXOTEL_SETTING_KEYS = {
  subdomain: "exotel.subdomain",
  phoneNumber: "exotel.phone_number",
} as const;

/** Exotel regional REST endpoints. The wrong region yields auth failures. */
export const EXOTEL_SUBDOMAINS = ["api.exotel.com", "api.in.exotel.com"] as const;
export const EXOTEL_DEFAULT_SUBDOMAIN = "api.exotel.com";

export interface TenantExotelCredentials {
  /** True when the three values required for REST calls are all present. */
  configured: boolean;
  accountSid: string | null;
  apiKey: string | null;
  apiToken: string | null;
  appId: string | null;
  subdomain: string;
  /** The tenant's own ExoPhone (display only; the bridge never needs it). */
  phoneNumber: string | null;
}

function normalizeSubdomain(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (EXOTEL_SUBDOMAINS as readonly string[]).includes(raw)
    ? raw
    : EXOTEL_DEFAULT_SUBDOMAIN;
}

/**
 * Decrypts the tenant's Exotel REST credentials. Call only from trusted server
 * code; the return value must never reach an HTTP response or a log line.
 */
export async function getTenantExotelCredentials(
  tenantId: string,
): Promise<TenantExotelCredentials> {
  const [accountSid, apiKey, apiToken, appId, subdomainRaw, phoneNumber] = await Promise.all([
    getTenantSecretValue(tenantId, "exotel", EXOTEL_SECRET_KEYS.accountSid),
    getTenantSecretValue(tenantId, "exotel", EXOTEL_SECRET_KEYS.apiKey),
    getTenantSecretValue(tenantId, "exotel", EXOTEL_SECRET_KEYS.apiToken),
    getTenantSecretValue(tenantId, "exotel", EXOTEL_SECRET_KEYS.appId),
    getTenantSetting<string>(tenantId, EXOTEL_SETTING_KEYS.subdomain, EXOTEL_DEFAULT_SUBDOMAIN),
    getTenantSetting<string | null>(tenantId, EXOTEL_SETTING_KEYS.phoneNumber, null),
  ]);

  return {
    configured: Boolean(accountSid && apiKey && apiToken),
    accountSid,
    apiKey,
    apiToken,
    appId,
    subdomain: normalizeSubdomain(subdomainRaw),
    phoneNumber:
      typeof phoneNumber === "string" && phoneNumber.trim() ? phoneNumber.trim() : null,
  };
}

/** HTTP Basic `Authorization` header value for Exotel REST calls. */
export function exotelAuthHeader(apiKey: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiToken}`).toString("base64")}`;
}

/** Builds the Exotel REST base URL for a tenant's region + account. */
export function exotelBaseUrl(accountSid: string, subdomain: string): string {
  return `https://${subdomain}/v1/Accounts/${encodeURIComponent(accountSid)}`;
}
