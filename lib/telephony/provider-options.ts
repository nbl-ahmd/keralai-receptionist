/** Provider choice is a setup view, never authority to adopt or reroute a DID. */
export const PHONE_PROVIDERS = ['vobiz', 'voicelink'] as const;
export type PhoneProvider = typeof PHONE_PROVIDERS[number];
export function isPhoneProvider(value: unknown): value is PhoneProvider {
  return typeof value === 'string' && PHONE_PROVIDERS.some(provider => provider === value);
}
export const VOICELINK_UNAVAILABLE = 'VoiceLink activation is pending verified media authentication, live call lookup and carrier hangup controls. Vobiz remains available separately.';
