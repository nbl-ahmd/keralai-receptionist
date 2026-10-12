import type { TelephonyProvider } from './types';
import { vobizProvider } from './providers/vobiz/provider';
import { HttpError } from '@/lib/auth/context';
import { VOICELINK_UNAVAILABLE } from './provider-options';
export function getTelephonyProvider(name = 'vobiz'): TelephonyProvider {
  if (name === 'voicelink') throw new HttpError(503, VOICELINK_UNAVAILABLE);
  if (name !== 'vobiz') throw new HttpError(409, 'This phone provider is unavailable');
  return vobizProvider;
}
