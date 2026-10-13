import { domainRoute } from '@/lib/telephony/http';
import { prepareVoiceLinkCheckout, voiceLinkCheckoutStatus } from '@/lib/telephony/providers/voicelink/checkout';
export const dynamic = 'force-dynamic';
export const GET = (r: Request) => domainRoute(r, voiceLinkCheckoutStatus);
export const POST = (r: Request) => domainRoute(r, async id => {
  const body = await r.json();
  return prepareVoiceLinkCheckout(id, { e164: body.e164, key: r.headers.get('idempotency-key') });
}, true);
