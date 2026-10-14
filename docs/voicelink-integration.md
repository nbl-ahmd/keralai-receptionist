# VoiceLink integration — authenticated API review

Reviewed 2026-10-13 using the operator-authorized logged-in reseller portal.
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
  The customer confirms the provider email and completes the managed KYC steps in this app; no provider password is needed.
- Managed account creation requires a prepaid reseller account.
- Client wallet starts at zero, negative threshold zero, reseller wallet bypass OFF.
  Provider portal access must not grant unbounded spending from the platform wallet.
- Managed KYC via the documented client-scoped reseller API plus authoritative status polling.
  Managed references have null session ID/expiry. No PAN/Aadhaar files, numbers, URLs
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

### Customer checkout

Migration `017_voicelink_checkout.sql` adds tenant-scoped durable order intents;
apply it through the migration runner before deploying the checkout UI. No
production database migration is performed by this code change.

Customers browse inventory and request a one-month DID quote after fresh KYC,
Alpha approval, browser testing and purchase entitlement. The server locks the
selected DID once and persists the provider order ID before fetching its summary.
The quote displays provider totals separately from explicit app retail prices.
No channels are added to a DID order: each client already needs allocated reseller
capacity. Operators provision channel capacity through the provider portal; individual DID
selection and assignment are handled by checkout instead of manual console work.

Paid confirmation uses only the tenant-owned saved order, fresh matching provider
pricing, renewal acceptance, reviewed exit/commitment terms, bounded parent funds,
platform and tenant limits, and an atomic app wallet reservation. Before confirming,
VoiceLink call readiness must also pass; an inactive unusable auto-renewing number
must not be bought merely to demonstrate checkout. It currently remains blocked.
Purchases are confirmed once, then assigned through `map-did` and read back from
client-owned inventory. Neither purchase nor assignment marks calls active or
captures the app hold; verified routing remains a separate activation step.

An uncertain draft, paid confirmation or mapping is retained for operator review.
Double clicks return the existing draft. Confirmation is never replayed for
`confirming`, `purchase_unknown`, `purchased`, `assignment_unknown` or `assigned`.
Expired drafts also require operator review; no cancellation API is invented.
The UI states that requesting a quote temporarily reserves inventory. No draft or
paid request is made just by opening the page.

Required reviewed commercial variables (blank means unknown):

```dotenv
VOICELINK_COMMERCIAL_TERMS_REFERENCE=
VOICELINK_RELEASE_COST_MINOR=
VOICELINK_COMMITMENT_MONTHS=
VOICELINK_CUSTOMER_MONTHLY_PRICE_MINOR=
VOICELINK_CUSTOMER_SETUP_PRICE_MINOR=
```

Only use zero release cost after provider confirmation. Minimum subscription is one month; a configured commitment below one month is rejected. The existing
Alpha DID ceilings, parent balance floor, purchase controls and sponsored wallet
credit also apply. A customer-supplied boolean cannot approve unknown terms or
activate VoiceLink. This checkout implementation does not resolve the outstanding
live media/termination/settlement contracts.

```dotenv
# From VoiceLink's documented POST /api/v1/auth/login response data.access_token.
# The logged-in browser cookie is NOT this credential. Do not paste it in chat.
VOICELINK_AUTH_TOKEN=
```

In Vercel's value field, save only `data.access_token`, including its `1|` prefix
if present. Do not include `Bearer`, surrounding quotes, JSON or the dotenv
assignment. Local dotenv syntax may use quotes because the dotenv parser removes
them. Redeploy after changing a hosting variable.

The authenticated status GET reads `/api/v1/reseller/profile`. Server logs contain
only allowlisted diagnostics, never the token, request headers or upstream error
messages:

- `invalid_credential_format`: malformed value rejected before any request.
- `http_401`/`http_403`: provider returned an access denial.
- `network_timeout`: the request exceeded the timeout or connection timed out.
- `network_dns`: provider hostname resolution failed.
- `network_tls`: certificate validation failed; repair the provider certificate,
  never disable TLS validation.
- `network_connection`: connection refused, reset or unreachable. Check provider
  firewall/access policy for the hosting region.
- `redirect_rejected`: provider redirected the API request. No redirect is
  followed and no credential is sent to the redirect destination.
- `network_or_response`: unclassified fetch failure; the original error is not
  logged because it may contain secrets.

The generic fetch error alone does not prove a token problem or firewall block.

On 2026-10-13 the user-supplied token in the official browser playground returned
HTTP 200 for the reseller profile. The actual trial schema uses `plan_type: free`
with explicit per-minute and recurring rates; the adapter now displays those
rates. A later portal observation confirms an active verified client under the
Trial Pack with allocated capacity. Account setup now follows reseller verification,
prepaid status, available capacity and valid rates rather than rejecting `free`.
The initial observed profile had zero unallocated channels; later reads showed
capacity after operator provisioning. No private account identity
or token is retained as a fixture.

Earlier production requests reported `network_timeout`. On 2026-10-13 the deployed BOM1 profile/inventory routes loaded successfully; the historical cause remains unconfirmed. The two VoiceLink profile/inventory routes
use per-function `vercel.json` configuration for Mumbai (`bom1`) as a regional connectivity test instead of the default US
function region. This is not evidence that a regional firewall caused the timeout
or that the timeout is fixed. Redeploy, check the actual function region, and
repeat the authenticated status GET. If it still times out, provider network
access clarification is needed. Failure logs include only a validated region ID.

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


## Recovery review and current deployment

See [13 October release evidence](./voicelink-review-2026-10-13.md) for deployed
commits, pending migrations, confirmed BOM1 connectivity, lifecycle ownership,
KYC/commercial discrepancies, remaining live acceptance and scheduler preparation.
Migration 018 adds durable client/draft correlation and read-only recovery.
Operators can reconcile exact client ownership or record support-confirmed unpaid
draft closure. Neither operation activates calls, repeats a purchase/mapping,
captures a wallet hold, or assumes a missing resource proves a failed purchase.
The [support request](./voicelink-support-request.md) is prepared but unsent.

Platform operators can explicitly connect an existing portal-created client from
administration. This uses authenticated reseller listing, requires an active INR
client whose email matches a workspace owner, and rejects an already claimed
client or an existing conflicting account intent. Operator reason/reference and
requested/completed audit entries are required. Linking changes local identifiers
only; it does not buy/allocate capacity, overwrite Vobiz, move wallet funds or
activate calls. KYC starts blocked and must be freshly polled afterward. Customers
cannot supply arbitrary client IDs through their setup route. Duplicate-email
preflight prevents a second provider creation attempt before recording an intent.

## Managed verification — 2026-10-14

The app automatically creates a client or uses an operator-linked existing client.
Legal details, individual/business selection, PAN verification, supporting document
uploads, DigiLocker initiation and business GST verification are now available in
Phone. Users do not create a second account or use a provider password/reset flow.
Email links remain provider-owned; OTP confirmation/resend use the owned client's
server-derived username and never return provider credentials.

`/api/telephony/voicelink/kyc` resolves membership and validates the reseller/client
identity pair before every read or action. Mutations require owner/admin,
canonical Origin, Alpha approval/browser completion, rate/size limits and an
operation lock. Client IDs and redirect destinations are assigned server-side.
The observed initial `account_type:null` state is accepted as unstarted and blocked.
Identity changes invalidate the previously stored verification gate before sending
an upstream mutation. Uncertain responses require progress polling, not auto-replay.

User-requested managed KYC relays identity details and documents in memory to
VoiceLink. It never stores them in the database, files, logs or browser storage.
Only progress states are retained. The upload route limits the body and file to
3 MB, validates MIME and magic bytes, and sends a generic filename. This differs
from the Vobiz hosted flow; the privacy notice explains the transient relay.
DigiLocker performs Aadhaar authentication externally. HTTPS redirect hosts are
allowlisted. Return query parameters are discarded; a redirect never proves KYC.

New optional server variables:

```dotenv
# Keep 0 until VoiceLink confirms final-submit accepts client_id and acts ONLY on it.
VOICELINK_CLIENT_KYC_FINALIZE_VERIFIED=0
# Provider-confirmed public HTTPS terms URL on app.voicelink.co.in or voicelink.co.in.
VOICELINK_KYC_TERMS_URL=
# Additional provider-confirmed exact DigiLocker redirect hostnames, comma-separated.
VOICELINK_KYC_REDIRECT_HOSTS=
```

The final-submit documentation currently lists no parameters although earlier KYC
steps explicitly support `client_id`. Final submission remains disabled until
that tenant-scoped contract is confirmed. Supporting documents can be completed
and progress checked without enabling this flag. It does not enable phone calls.

VoiceLink live calling still requires verified WSS/callback authentication,
authoritative live call ownership, carrier hangup/max-duration controls and final
CDR settlement semantics. No public VoiceLink bridge route is mounted, no paid
DID is purchased, and `activationReady` remains false. Synthetic tests cannot
supply production provider acceptance evidence.

Registration cannot submit legal consent until a confirmed, publicly readable terms URL is configured. The portal manual also describes signature/live-photo/location steps absent from the API endpoint list; provider confirmation of the complete API agreement process is required before finalization.
