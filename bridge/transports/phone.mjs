import { ExotelTransport } from './exotel-legacy.mjs';
import { VobizTransport } from './vobiz.mjs';
import { VoiceLinkTransport } from './voicelink.mjs';

/** Internal factory only: claims must already pass carrier authentication,
 * authoritative call lookup, owned DID routing and one-use budget admission.
 * Public VoiceLink admission remains rejected in telephony.mjs/server.mjs.
 */
export function phoneTransport(ws, claims) {
  if (!claims) return new ExotelTransport(ws);
  if (claims.provider === 'vobiz') return new VobizTransport(ws, claims);
  if (claims.provider === 'voicelink') return new VoiceLinkTransport(ws, claims);
  throw new Error('Unsupported authenticated phone provider');
}
