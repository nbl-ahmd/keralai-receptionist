/**
 * lib/net/safe-webhook-url.ts
 *
 * SSRF guard for outbound webhook URLs a tenant can configure (CRM sync).
 *
 * Tenant-supplied URLs are untrusted: a naive `fetch()` lets a tenant point the
 * server at cloud metadata (`169.254.169.254`), internal services, or local
 * loopback. This validates the URL and every DNS result before the request.
 *
 * In production: HTTPS only, ports 80/443 only, and no private/loopback/
 * link-local/metadata targets. Outside production, loopback is allowed so a
 * local webhook (n8n, Make, etc.) can be tested; metadata/link-local is still
 * blocked. Callers must also disable redirects (`redirect: "error"`) so a 3xx
 * cannot bounce to a blocked target after validation.
 *
 * Server-only.
 */

import { lookup } from "node:dns/promises";
import net from "node:net";

export type SafeUrlResult = { ok: true } | { ok: false; reason: string };

const METADATA_HOSTNAMES = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
]);

/** IPv4 ranges that must never be reachable from a webhook. */
function ipv4IsBlocked(ip: string, allowLoopback: boolean): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a >= 224) return true; // multicast + reserved
  // RFC1918 / CGNAT stay blocked even in development; only true loopback is
  // relaxed so a local webhook can be tested.
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return !allowLoopback; // loopback: allowed only in dev
  return false;
}

function ipv6IsBlocked(ip: string, allowLoopback: boolean): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::") return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice("::ffff:".length);
    return net.isIPv4(v4) ? ipv4IsBlocked(v4, allowLoopback) : true;
  }
  const firstHextet = lower.split(":")[0] ?? "";
  if (/^[0-9a-f]{1,4}$/.test(firstHextet)) {
    const hextet = parseInt(firstHextet, 16);
    if ((hextet & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((hextet & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  }
  if (lower === "::1") return !allowLoopback; // loopback: allowed only in dev
  return false;
}

function addressIsBlocked(address: string, allowLoopback: boolean): boolean {
  return net.isIPv4(address)
    ? ipv4IsBlocked(address, allowLoopback)
    : ipv6IsBlocked(address, allowLoopback);
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<SafeUrlResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const isProduction = process.env.NODE_ENV === "production";
  const allowLoopback = !isProduction;

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "unsupported_protocol" };
  }
  if (isProduction && url.protocol !== "https:") {
    return { ok: false, reason: "https_required" };
  }

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) {
    return { ok: false, reason: "port_not_allowed" };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) return { ok: false, reason: "missing_host" };
  if (METADATA_HOSTNAMES.has(host)) return { ok: false, reason: "metadata_host" };
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return { ok: false, reason: "internal_host" };
  }
  if (host === "localhost") {
    return allowLoopback ? { ok: true } : { ok: false, reason: "loopback" };
  }

  if (net.isIP(host)) {
    return addressIsBlocked(host, allowLoopback)
      ? { ok: false, reason: "private_ip" }
      : { ok: true };
  }

  let records: { address: string; family: number }[];
  try {
    records = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: "dns_lookup_failed" };
  }
  if (records.length === 0) return { ok: false, reason: "dns_no_records" };
  for (const record of records) {
    if (addressIsBlocked(record.address, allowLoopback)) {
      return { ok: false, reason: "private_ip" };
    }
  }

  return { ok: true };
}
