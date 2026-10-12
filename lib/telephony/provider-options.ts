/** Provider choice is a setup view, never authority to adopt or reroute a DID. */
export const PHONE_PROVIDERS = ['vobiz', 'voicelink'] as const;
export type PhoneProvider = typeof PHONE_PROVIDERS[number];
export function isPhoneProvider(value: unknown): value is PhoneProvider {
  return typeof value === 'string' && PHONE_PROVIDERS.some(provider => provider === value);
}
export const VOICELINK_UNAVAILABLE = 'VoiceLink activation is pending its provisioning API and authenticated callback contracts. Vobiz remains available separately.';
