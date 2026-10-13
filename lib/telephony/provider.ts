import type { TelephonyProvider } from './types';
import { vobizProvider } from './providers/vobiz/provider';
import { HttpError } from '@/lib/auth/context';
import { voiceLinkProvider } from './providers/voicelink/provider';
export function getTelephonyProvider(name = 'vobiz'): TelephonyProvider {
  if (name === 'voicelink') return voiceLinkProvider;
  if (name !== 'vobiz') throw new HttpError(409, 'This phone provider is unavailable');
  return vobizProvider;
}
