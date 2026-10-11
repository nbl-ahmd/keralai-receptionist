import { ProviderError } from '../../errors';
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
    if (!response.ok) throw new ProviderError(`http_${response.status}`, response.status >= 500, response.status);
    if (response.status === 204) return {};
    const text = await response.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('network_or_response', method !== 'GET');
  }
}
