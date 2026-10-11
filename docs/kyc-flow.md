# Hosted individual identity verification

External customers always use `kyc_mode=customer_use` and `business_type=individual`, regardless of personal/business assistant language. Individual verification is PAN plus Aadhaar through DigiLocker. Company-entity KYC is outside this beta.

KeralAI calls the hosted-session endpoint server-side with parent credentials, `account_auth_id`, redirect flow, return URL, webhook URL and one-day expiry. It returns the validated HTTPS `kyc.vobiz.ai` widget URL once to the authenticated owner/admin. The URL is not stored or logged. The browser opens the hosted flow; KeralAI stores only provider account IDs, session ID/expiry/status, document states, verified/check timestamps and the provider call gate. It does not collect PAN numbers, Aadhaar files or DigiLocker credentials.

The return query `verification=return` only triggers a status poll. It cannot mark verification complete. The hosted webhook verifies raw-body HMAC-SHA256 using the parent token (`X-Vobiz-Signature: sha256=<hex>`), maps account/session to tenant, deduplicates the body digest and polls status before storing the gate. Unknown/old session callbacks are acknowledged without touching the current tenant flow. Callback body document states never authorize calls.

The final gate is strictly `kyc_calls_blocked === false` and active account/tenant. Even a displayed `verified` status with a blocked gate cannot activate. PAN/Aadhaar states are explanatory UI data, not a local decision engine. Concurrent polls only replace observations from an earlier request start. Each activation and incoming answer fetches fresh provider status, so provider outages fail closed.

The UI supports not started, pending, failed, expired/revoked session, verified and restart. A new hosted session replaces the reference; expiration never unlocks calls. Cancellation can return users to Phone and they can restart. KYC webhook delivery errors return 503 for retries. A status poll and the scheduled job recover missed callbacks. Session UI labels are advisory; provider gate remains authoritative.

## Test mode

The official [test-mode contract](https://www.vobiz.ai/docs/sub-accounts/kyc/test-mode) uses `/sub-accounts/test/{SA}/kyc/...`, normal parent auth and magic values. These endpoints write real provider KYC records: only use a new throwaway individual customer-use account, never a customer account or a DID that serves users.

```bash
VOBIZ_KYC_TEST_DISPOSABLE=1 VOBIZ_KYC_TEST_SUBACCOUNT=SA_THROWAWAY npm run test:vobiz-kyc
```

The script validates initial blocking, PAN failed/pending/verified, PAN-only remaining blocked, mock DigiLocker completion and the final provider gate. It does not print credentials, request bodies or documents. There is no documented hosted-session mock mirror, so the app does not invent one. Local integration tests use deterministic HTTP fixtures and a disposable database schema for expired-session restart and duplicate webhook behavior. Provider test mode and the hosted redirect still require real platform credentials and must be run before release.
