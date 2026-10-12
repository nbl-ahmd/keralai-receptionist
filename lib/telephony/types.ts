export type KycState = 'not_started' | 'pending' | 'verified' | 'failed';
export interface CustomerAccount {
  accountId: string; authId: string; authToken?: string; enabled: boolean;
}
export interface KycStatus {
  status: KycState; callsBlocked: boolean; documents: Record<string, KycState>;
}
export interface KycSession { id: string; url: string; expiresAt: string; status: string }
export interface AvailableNumber {
  id: string; e164: string; country: string; region: string;
  monthlyCost: string; setupCost: string; currency: string; voice: boolean;
  releaseCost?: string; commitmentMonths?: number; available?: boolean; restricted?: boolean;
}
export interface NumberInventory { items: AvailableNumber[]; total: number; page: number }
export interface AccountRef { tenantId: string; authId: string }
export interface ProviderCall {
  id: string; from: string; to: string; direction: 'inbound' | 'outbound'; status: string;
  startedAt?: string; answeredAt?: string; endedAt?: string;
  durationSeconds?: number; billableSeconds?: number; cost?: string; currency?: string;
}
export interface TelephonyProvider {
  readonly name: string;
  readonly configured: boolean;
  readonly activationReady: boolean;
  createCustomerAccount(input: { name: string; email: string }): Promise<CustomerAccount>;
  getCustomerAccount(account: AccountRef): Promise<CustomerAccount>;
  createKycSession(account: AccountRef, input: { returnUrl: string; webhookUrl: string }): Promise<KycSession>;
  getKycStatus(account: AccountRef): Promise<KycStatus>;
  getPlatformBalance(): Promise<{availableMinor: number; active: boolean}>;
  searchAvailableNumbers(input: { search?: string; page?: number }): Promise<NumberInventory>;
  purchaseNumber(account: AccountRef, e164: string): Promise<AvailableNumber>;
  listOwnedNumbers(account: AccountRef, page: number): Promise<NumberInventory>;
  releaseNumber(account: AccountRef, e164: string): Promise<void>;
  createInboundApplication(account: AccountRef, name: string, urls: { answer: string; hangup: string }): Promise<string>;
  configureInboundRouting(account: AccountRef, e164: string, applicationId: string): Promise<void>;
  verifyInboundRouting(account: AccountRef, e164: string, applicationId: string): Promise<boolean>;
  createOutboundCall(account: AccountRef, input: { from: string; to: string; answer: string; hangup: string }): Promise<string>;
  getCall(account: AccountRef, id: string, completed?: boolean): Promise<ProviderCall>;
  verifyVoiceWebhook(input: { headers: Headers; url: string; token?: string }): string | null;
  verifyKycWebhook(input: { rawBody: string; headers: Headers }): boolean;
}

export interface TelephonyAccountRow {
  id: string; tenant_id: string; provider: string; provider_auth_id: string | null;
  provider_account_id: string | null; status: string; kyc_status: KycState; kyc_calls_blocked: boolean;
  document_states: Record<string, KycState>; kyc_session_id: string | null;
  kyc_session_status: string | null; kyc_session_expires_at: string | null;
  kyc_last_checked_at: string | null; error_code: string | null;
}
export interface PhoneNumberRow {
  id: string; tenant_id: string; telephony_account_id: string; provider: string;
  e164: string; region: string; status: string; provisioning_status: string;
  application_id: string | null; customer_monthly_price_minor: string;
  release_requested_at: string|null; initial_charge_minor: string; idempotency_key: string; error_code: string | null;
}
