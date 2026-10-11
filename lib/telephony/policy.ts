import { HttpError } from '@/lib/auth/context';

export function normalizeE164(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Invalid phone number');
  const clean = value.trim().replace(/[\s().-]/g, '');
  const normalized = clean.startsWith('+') ? clean : `+${clean}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new HttpError(400, 'Invalid phone number');
  return normalized;
}
export function price(name: string): number {
  const value = process.env[name];
  if (!value || !/^\d+$/.test(value)) throw new HttpError(503, 'Phone plans are not yet available. Contact support.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 10000000) throw new HttpError(503, 'Phone plans are not yet available.');
  return parsed;
}
export function assertActivationAllowed(account: { status: string; kyc_calls_blocked: boolean } | null) {
  if (!account || account.status !== 'active' || account.kyc_calls_blocked !== false)
    throw new HttpError(409, 'Complete identity verification before activating a number.');
}
export function callCharge(seconds: number, rate: number): number {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 604800 || !Number.isSafeInteger(rate) || rate <= 0)
    throw new HttpError(503, 'Usage requires review');
  return Math.ceil(seconds / 60) * rate;
}
export function publicOrigin(): string {
  const origin = process.env.TELEPHONY_PUBLIC_ORIGIN;
  if (!origin) throw new HttpError(503, 'Phone setup is not available yet.');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new HttpError(503, 'Phone setup is not available yet.');
  return url.origin;
}
export function operationKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value))
    throw new HttpError(400, 'A valid operation key is required');
  return value;
}
