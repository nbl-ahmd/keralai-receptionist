# VoiceLink integration — authenticated API review

Reviewed 2026-10-12 using the operator-authorized logged-in reseller portal.
Vobiz remains available separately. VoiceLink media is compatible with the bridge,
but production calling is still blocked on provider authentication/live-call/hangup
contracts. Do not set Vobiz signature flags to activate VoiceLink.

## Implemented application flow

The Phone page selects `/dashboard/phone?provider=voicelink`. It loads the
VoiceLink account separately from Vobiz, preserving both provider account rows and
existing number routing. Provider parameters in query/body must agree. Unsupported
VoiceLink number/call operations are rejected before any Vobiz operation.

- Server-side Sanctum Bearer client, fixed HTTPS origin, no redirects, redacted errors.
- Current reseller plan, number/channel rates and available capacity from the API.
- Customer creation using an existing unallocated channel, without buying capacity.
- The generated provider password is sent only to VoiceLink, never retained or returned.
  The customer verifies the provider email and uses its login/reset flow for KYC.
- Managed account creation requires a prepaid reseller account.
- Client wallet starts at zero, negative threshold zero, reseller wallet bypass OFF.
  Provider portal access must not grant unbounded spending from the platform wallet.
- KYC portal handoff plus authoritative status polling; no invented session/widget API.
  Portal references have null session ID/expiry. No PAN/Aadhaar files, numbers, URLs
  or addresses are persisted or returned. Verified requires literal `is_complete=true`,
  `kyc_status=1`, `current_step=complete`, verified PAN/Aadhaar and GST for business.
- Parent/client identity pairs are stored and checked before account/KYC/ownership reads.
- Read-only number inventory includes independent number and channel monthly prices.
- Scheduled KYC reconciliation dispatches by the stored provider.
- G.711 A-law codec/media transport is fixture-tested, intentionally not publicly mounted.

Account creation is a customer action, requires Alpha phone approval/browser testing,
active membership, same-origin owner/admin access, and verified available provider
capacity. Unknown creation outcomes retain `needs_review`; never blindly recreate.

## Server configuration

```dotenv
# From VoiceLink's documented POST /api/v1/auth/login response data.access_token.
# The logged-in browser cookie is NOT this credential. Do not paste it in chat.
VOICELINK_AUTH_TOKEN=
```

A read-only profile test in the logged-in portal's API playground returned 401
without a Bearer token. No credential was extracted from browser cookies/storage,
no API token was generated and no live configuration was changed.

Optional operator quote display, all amounts in INR paise:

```dotenv
VOICELINK_QUOTE_REFERENCE=
VOICELINK_NUMBER_MONTHLY_MINOR=
VOICELINK_CHANNEL_MONTHLY_MINOR=
VOICELINK_INBOUND_MINUTE_MINOR=
VOICELINK_OUTBOUND_MINUTE_MINOR=
```

When the API is configured, current 60-second limited-plan prices supersede the optional
quote. Other billing units/bundles require confirmation. Missing
or malformed commercial fields remain unknown, not zero. The displayed estimate
includes one number + one channel + incoming billed minutes, excluding taxes,
setup, release, commitments, AI, hosting, plan fees and additional call legs.

## Confirmed API paths

Base: `https://app.voicelink.co.in/api/v1`, `Authorization: Bearer <Sanctum token>`.

| Operation | Method/path | Application status |
| --- | --- | --- |
| Reseller profile/capacity/plan | GET `/reseller/profile` | Implemented |
| Reseller-owned clients | GET `/reseller/clients` | Implemented |
| Customer creation | POST `/reseller/client/create` | Implemented with capacity preflight |
| Customer KYC status | GET `/reseller/kyc/status?client_id=...` | Implemented, identity fields discarded |
| Available inventory | GET `/reseller/purchase/dids` | Implemented read-only |
| Owned inventory | GET `/reseller/did/purchased?client_id=...` | Implemented with parent/client checks |
| Call record | GET `/call-log/details?call_id=...` | Client read implemented; live admission/billing semantics unconfirmed |
| DID draft order | POST `/reseller/purchase/lock-did` | Documented; purchasing remains disabled |
| Add order channels | POST `/reseller/purchase/add-channel` | Documented; purchasing remains disabled |
| Order quote | GET `/reseller/purchase/summary/{order_id}` | Documented |
| Final purchase | POST `/reseller/purchase/confirm` | Disabled pending live/commercial acceptance |
| DID assignment | POST `/reseller/client/map-did` | Documented; no live assignment performed |
| Bot creation | POST `/websocket-bot/create` | Documented; no live bot created |
| Routing | POST `/call-routing/create`, `/call-routing/update/{id}` | Documented; no live route changed |
| Release | POST `/reseller/did/release` | Documented; no release performed |

Customer KYC is performed in the provider portal. The step-1 API accepts legally
binding telecom terms and later steps handle identity documents: the app does not
submit those on a customer's behalf. No auto-acceptance or document proxy is added.

## Remaining live-calling blockers

1. Supported authentication/signatures for both WSS connections and HTTP callbacks.
   Bot creation only documents URLs; the inspected UI exposes no authentication fields.
2. Authoritative live call lookup before Gemini admission. The Call Details API describes
   call logs/CDRs, but does not establish availability/status semantics during a call.
3. Supported carrier hangup and maximum-duration enforcement. An incoming `stop` event
   or closing the WebSocket does not establish that billable PSTN service terminates.
4. Exact billable-duration field (`talk_duration` versus `call_duration`), timezone,
   charging pulse, channel sharing, renewal commitments and release fees.
5. Bounded sponsored provider-wallet funding for clients and prevention of portal-side
   spending beyond platform-approved credit. Wallet bypass must not be enabled casually.

Do not mount the media transport, reserve provider funds or activate customer numbers
until these are resolved and acceptance is completed. No environment flag bypasses this.

## Documentation and pricing discrepancies

The API purchase-confirm documentation says auto-renew is **mandatory** and cannot
be disabled, whereas the public manual describes disabling auto-renew. Follow the
more specific API contract for purchasing, and obtain written cancellation terms.
Release is documented as partial success; HTTP 200 alone is not release confirmation.
No setup/release fees are inferred from their absence in inventory.

The authenticated portal offers additional bot controls absent from the API schema:
WebSocket API, A-law, mu-law, PCM16 8 kHz, PCM16 16 kHz and noise cancellation.
The existing adapter follows the specific A-law event schema. Codec fields/API behavior
and playback mark semantics still need confirmation. Noise cancellation was not enabled.

Account-specific prices observed in the private portal are recorded only in the local
operator review, not hard-coded into the application or published as universal rates.

## Primary references

- Authenticated [Developer Hub](https://app.voicelink.co.in/developer/docs)
- Account [My Plan](https://app.voicelink.co.in/my-plan)
- [Client KYC](https://app.voicelink.co.in/documentation/login-kyc-2/)
- [Client management](https://app.voicelink.co.in/documentation/client-management/)
- [WebSocket events](https://app.voicelink.co.in/documentation/websocket-events/)
- [Bot configuration](https://app.voicelink.co.in/documentation/websocket-bots/)
