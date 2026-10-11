import crypto from 'node:crypto';
import { parentCredentials } from './client';

function equal(a: string, b: string) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
export function verifyKycWebhook({ rawBody, headers }: { rawBody: string; headers: Headers }): boolean {
  const expected = 'sha256=' + crypto.createHmac('sha256', parentCredentials().authToken).update(rawBody).digest('hex');
  return equal(expected, headers.get('x-vobiz-signature') ?? '');
}
export function verifyVoiceWebhook({ headers, url, token }: { headers: Headers; url: string; token?: string }): string | null {
  const parsed = new URL(url);
  const base = parsed.origin + parsed.pathname;
  for (const version of ['v3','v2']) {
    const nonce = headers.get(`x-vobiz-signature-${version}-nonce`);
    if (!nonce || nonce.length > 256) continue;
    const message = base + (version === 'v3' ? '.' : '') + nonce;
    const parent = headers.get(`x-vobiz-signature-ma-${version}`) ?? '';
    const expected = crypto.createHmac('sha256', parentCredentials().authToken).update(message).digest('base64');
    if (parent && equal(parent, expected)) return nonce;
    const direct = headers.get(`x-vobiz-signature-${version}`) ?? '';
    if (token && equal(direct, crypto.createHmac('sha256', token).update(message).digest('base64'))) return nonce;
    if (equal(direct, expected)) return nonce;
  }
  return null;
}
export function eventHash(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }
