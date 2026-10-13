// Read-only diagnostics. Configure VOICELINK_AUTH_TOKEN securely in the process
// environment to compare the exact application client. No dotenv values printed.
import dns from 'node:dns/promises';
import tls from 'node:tls';
import { VoiceLinkClient } from '../lib/telephony/providers/voicelink/client';
import { safeProfile } from '../lib/telephony/providers/voicelink/schemas';
import { ProviderError, providerErrorDetails } from '../lib/telephony/errors';

async function main() {
const hostname = 'app.voicelink.co.in';
const region = /^[a-z]{3}\d$/.test(process.env.VERCEL_REGION ?? '') ? process.env.VERCEL_REGION : 'local';
console.log(JSON.stringify({ check: 'request_contract', region, method: 'GET',
  url: `https://${hostname}/api/v1/reseller/profile`, headers: ['Authorization','Accept','Content-Type'],
  redirect: 'manual', timeoutMs: 10000, authenticated: !!process.env.VOICELINK_AUTH_TOKEN?.trim() }));
const started = Date.now();
try {
  const addresses = await dns.lookup(hostname, { all: true });
  console.log(JSON.stringify({ check: 'dns', families: [...new Set(addresses.map(row => row.family))], elapsedMs: Date.now()-started }));
  const tlsStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: true });
    socket.setTimeout(8000, () => { socket.destroy(); reject(new ProviderError('network_timeout')); });
    socket.once('secureConnect', () => { socket.end(); resolve(); });
    socket.once('error', () => reject(new ProviderError('network_tls_or_connection')));
  });
  console.log(JSON.stringify({ check: 'tls', verified: true, elapsedMs: Date.now()-tlsStart }));
  const requestStart = Date.now();
  if (process.env.VOICELINK_AUTH_TOKEN?.trim()) {
    const profile = safeProfile(await new VoiceLinkClient().profile());
    console.log(JSON.stringify({ check: 'profile', httpStatus: 200, elapsedMs: Date.now()-requestStart,
      planType: profile.planType, billingMode: profile.billingMode, availableChannels: profile.availableChannels,
      // No wallet balance, account identities or private response fields.
      activationReady: false }));
  } else {
    const response = await fetch(`https://${hostname}/api/v1/reseller/profile`, { method:'GET',redirect:'manual',
      headers:{ Accept:'application/json','Content-Type':'application/json' },signal:AbortSignal.timeout(10000) });
    await response.body?.cancel();
    console.log(JSON.stringify({check:'unauthenticated_connectivity',httpStatus:response.status,elapsedMs:Date.now()-requestStart}));
  }
} catch (error) {
  console.error(JSON.stringify({ check:'failed',region,
    ...(error instanceof ProviderError ? providerErrorDetails(error) : {providerCode:'network_or_response'}) }));
  process.exitCode=1;
}
}
void main();
