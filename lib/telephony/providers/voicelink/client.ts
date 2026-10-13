import { ProviderError } from '../../errors';

export type VoiceLinkData = Record<string, unknown>;
export function record(value: unknown): VoiceLinkData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ProviderError('invalid_response');
  return value as VoiceLinkData;
}
export function providerId(value: unknown): string {
  const id = String(value ?? '');
  if (!/^[1-9]\d{0,14}$/.test(id)) throw new ProviderError('invalid_response');
  return id;
}

/** Sanctum API documented in the authenticated VoiceLink Developer Hub.
 * Fixed origin, no redirects and no payload/URL/credential logging.
 */
export class VoiceLinkClient {
  constructor(private token?: string, private fetcher?: typeof fetch) {}
  async request(path: string, options: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string>; operation?: string } = {}): Promise<unknown> {
    const token = this.token ?? process.env.VOICELINK_AUTH_TOKEN?.trim();
    if (!token) throw new ProviderError('not_configured');
    if (!/^\/(?:reseller|auth|websocket-bot|call-routing|call-log)\/[a-z0-9/_-]+$/.test(path)) throw new ProviderError('invalid_response');
    const url = new URL(`/api/v1${path}`, 'https://app.voicelink.co.in');
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const method = options.method ?? 'GET';
    const operation = options.operation ?? 'provider_request';
    let response: Response;
    try {
      response = await (this.fetcher ?? fetch)(url, { method, redirect: 'error', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: AbortSignal.timeout(10000) });
    } catch { throw new ProviderError('network_or_response', method !== 'GET', undefined, operation); }
    if (!response.ok) throw new ProviderError(`http_${response.status}`, method !== 'GET', response.status, operation);
    try {
      const text = await response.text();
      if (text.length > 2 * 1024 * 1024) throw new Error('Oversized response');
      const envelope = record(JSON.parse(text));
      if (envelope.status !== true || !('data' in envelope)) throw new Error('Invalid envelope');
      return envelope.data;
    } catch { throw new ProviderError('invalid_response', method !== 'GET', undefined, operation); }
  }
  async profile() { return record(await this.request('/reseller/profile', { operation: 'read_account' })); }
  async clients() {
    const data = await this.request('/reseller/clients', { operation: 'read_account' });
    if (!Array.isArray(data)) throw new ProviderError('invalid_response');
    return data.map(record);
  }
  async kyc(clientId: string) {
    return record(await this.request('/reseller/kyc/status', { query: { client_id: providerId(clientId) }, operation: 'kyc_status' }));
  }
  async purchased(clientId: string, page = 1) {
    return record(await this.request('/reseller/did/purchased', { query: { client_id: providerId(clientId), page: String(page), per_page: '100' }, operation: 'owned_numbers' }));
  }
  async inventory(search = '', page = 1, type = '3') {
    if (!/^[+0-9]{0,16}$/.test(search) || !Number.isInteger(page) || page < 1 || !['2', '3'].includes(type)) throw new ProviderError('invalid_inventory');
    return record(await this.request('/reseller/purchase/dids', { query: { country_code: '+91', type, months: '1', number: search, page: String(page), per_page: '25' }, operation: 'inventory' }));
  }
  async call(id: string) {
    if (!/^[a-zA-Z0-9._-]{1,100}$/.test(id)) throw new ProviderError('invalid_call');
    return record(await this.request('/call-log/details', { query: { call_id: id }, operation: 'cdr' }));
  }
}
