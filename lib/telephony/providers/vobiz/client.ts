import { ProviderError } from '../../errors';
function operation(path:string,method:string) {
  if(path.includes('/kyc-sessions'))return 'kyc_session';
  if(path.includes('/kyc/status'))return 'kyc_status';
  if(path.includes('/sub-accounts/'))return method==='POST'?'create_account':'read_account';
  if(path.includes('/balance/'))return 'balance';
  if(path.includes('/inventory/numbers'))return 'inventory';
  if(path.includes('/purchase-from-inventory'))return 'purchase';
  if(path.includes('/Application/'))return 'application';
  if(path.endsWith('/application'))return 'routing';
  if(path.includes('/cdr/'))return 'cdr';
  if(path.includes('/Call/'))return 'call';
  if(path.includes('/numbers'))return method==='DELETE'?'release':'owned_numbers';
  return 'provider_request';
}
export function parentCredentials() {
  const authId = process.env.VOBIZ_AUTH_ID;
  const authToken = process.env.VOBIZ_AUTH_TOKEN;
  if (!authId || !authToken) throw new ProviderError('not_configured');
  return { authId, authToken };
}
// No automatic retries on money-moving requests. Paths are verified against MCP.
export async function request(path: string, options: {
  method?: string; body?: unknown; credentials?: { authId: string; authToken: string };
} = {}): Promise<unknown> {
  const creds = options.credentials ?? parentCredentials();
  const method = options.method ?? 'GET';
  try {
    const response = await fetch(`https://api.vobiz.ai/api/v1${path}`, {
      method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'X-Auth-ID': creds.authId, 'X-Auth-Token': creds.authToken, 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) throw new ProviderError(`http_${response.status}`, response.status >= 500, response.status,operation(path,method));
    if (response.status === 204) return {};
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('network_or_response', method !== 'GET',undefined,operation(path,method));
  }
}
