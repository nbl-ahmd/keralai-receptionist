import { domainRoute } from '@/lib/telephony/http';
import { confirmVoiceLinkCheckout } from '@/lib/telephony/providers/voicelink/checkout';
export const POST = (r: Request) => domainRoute(r, async id => confirmVoiceLinkCheckout(id, await r.json()), true);
