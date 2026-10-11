import { ProviderError } from '../../errors';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderError('invalid_response', true);
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new ProviderError('invalid_response', true);
  return value;
}
export function decimal(value: unknown): string {
  const str = typeof value === 'number' ? String(value) : value;
  if (typeof str !== 'string' || !/^\d+(\.\d{1,8})?$/.test(str)) throw new ProviderError('invalid_price', true);
  return str;
}
export function integer(value: unknown): number {
  const n = Number(value);
  if (value == null || !Number.isSafeInteger(n) || n < 0) throw new ProviderError('invalid_response', true);
  return n;
}
