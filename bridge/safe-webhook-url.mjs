/**
 * bridge/safe-webhook-url.mjs
 *
 * Bridge twin of lib/net/safe-webhook-url.ts. Blocks SSRF via tenant-configured
 * CRM webhook URLs: production is HTTPS-only on ports 80/443 with no private,
 * loopback, link-local or cloud-metadata targets; outside production loopback is
 * allowed for local webhooks while metadata/link-local stays blocked. Callers
 * must also pass `redirect: 'error'` so a redirect cannot bypass validation.
 */

import { lookup } from 'node:dns/promises';
import net from 'node:net';

const METADATA_HOSTNAMES = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

function ipv4IsBlocked(ip, allowLoopback) {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return !allowLoopback;
  return false;
}

function ipv6IsBlocked(ip, allowLoopback) {
  const lower = ip.toLowerCase();
  if (lower === '::') return true;
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length);
    return net.isIPv4(v4) ? ipv4IsBlocked(v4, allowLoopback) : true;
  }
  const firstHextet = lower.split(':')[0] ?? '';
  if (/^[0-9a-f]{1,4}$/.test(firstHextet)) {
    const hextet = parseInt(firstHextet, 16);
    if ((hextet & 0xffc0) === 0xfe80) return true;
    if ((hextet & 0xfe00) === 0xfc00) return true;
  }
  if (lower === '::1') return !allowLoopback;
  return false;
}

function addressIsBlocked(address, allowLoopback) {
  return net.isIPv4(address)
    ? ipv4IsBlocked(address, allowLoopback)
    : ipv6IsBlocked(address, allowLoopback);
}

/** @returns {Promise<{ ok: true } | { ok: false, reason: string }>} */
export async function assertSafeWebhookUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const allowLoopback = !isProduction;

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'unsupported_protocol' };
  }
  if (isProduction && url.protocol !== 'https:') {
    return { ok: false, reason: 'https_required' };
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443) {
    return { ok: false, reason: 'port_not_allowed' };
  }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return { ok: false, reason: 'missing_host' };
  if (METADATA_HOSTNAMES.has(host)) return { ok: false, reason: 'metadata_host' };
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return { ok: false, reason: 'internal_host' };
  }
  if (host === 'localhost') {
    return allowLoopback ? { ok: true } : { ok: false, reason: 'loopback' };
  }

  if (net.isIP(host)) {
    return addressIsBlocked(host, allowLoopback)
      ? { ok: false, reason: 'private_ip' }
      : { ok: true };
  }

  let records;
  try {
    records = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: 'dns_lookup_failed' };
  }
  if (!records.length) return { ok: false, reason: 'dns_no_records' };
  for (const record of records) {
    if (addressIsBlocked(record.address, allowLoopback)) {
      return { ok: false, reason: 'private_ip' };
    }
  }

  return { ok: true };
}
