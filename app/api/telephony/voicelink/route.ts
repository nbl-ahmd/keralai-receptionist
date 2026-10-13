import { domainRoute } from '@/lib/telephony/http';
import { HttpError } from '@/lib/auth/context';
import { voiceLinkStatus } from '@/lib/telephony/providers/voicelink/status';
import { VOICELINK_UNAVAILABLE } from '@/lib/telephony/provider-options';

export const dynamic = 'force-dynamic';
export const GET = (request: Request) => domainRoute(request, async () => voiceLinkStatus());
export const POST = (request: Request) => domainRoute(request, async () => {
  throw new HttpError(503, VOICELINK_UNAVAILABLE);
}, true);
