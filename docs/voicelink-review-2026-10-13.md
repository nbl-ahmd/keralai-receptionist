# VoiceLink review and release evidence — 13 October 2026

This is an incomplete live integration. Account/KYC/inventory adapters and
checkout/recovery code are reviewable; paid checkout and live calling remain
blocked. Vobiz and browser voice remain separate existing paths. No purchase,
fund transfer, KYC submission, route activation, signature activation, merge,
production migration or deployment was performed during this review.

## Repository and deployment inventory

| Work | Verified state |
| --- | --- |
| PR 13 | Merged; separate provider view and fixture-tested A-law transport. Transport had no public admission path. |
| PR 14 | Merged; authenticated reseller reads, client creation and hosted portal handoff. Media/CDR contracts unresolved. |
| PR 15 | Merged; fixed-origin Bearer client, sanitized network diagnostics and redirect rejection. |
| PR 16 | Merged; production commit `1c2684f0dea8f9ad7cd6006333cc67eb5c276cbe`. Actual profile and inventory functions confirmed BOM1 in Vercel Resources. |
| PR 17 | OPEN, commit `f0901917051e1fe012e00e3430effe64b86b95a6`; successful CI and preview, not production. Migration 017 pending in configured application DB. |
| Render | `/health` returns 200; commit `1f28d8e8ea52a8c46da293241931cb4b6bd0c50d` (PR 13 era), older than app. Health is liveness, not call acceptance. |
| Database | Read-only migration status: 001–016 applied; 017 and new 018 pending. |

PR 13–16 review records contain Copilot quota-limit notices, not successful code
reviews. PR 17 has no submitted review. This worktree builds on PR 17 and leaves
the original `feat/full-alpha` workspace and its uncommitted documentation intact.

## Connectivity evidence

The official playground's GET `/reseller/profile`, using the existing token
configured there, returned HTTP 200 during this review. The production Phone
page's Refresh fetched current provider plan/capacity without a connection error.
Its fresh result changed available channels from an earlier zero to one. It
reports Trial Pack, `plan_type=free`, prepaid billing and a 60-second pulse.
This is an observation, not confirmation that Trial Pack permits client creation.

Local DNS returned IPv4; verified TLS completed and an unauthenticated GET returned
401 in about 0.2 seconds. A reusable read-only probe is available:

```sh
node --import tsx scripts/diagnose-voicelink.ts
```

Supply a local token through secure process configuration only if an authenticated
local comparison is wanted. The probe does not load or print dotenv secrets.
It emits DNS family, verified TLS, fixed request metadata and selected profile
fields, never response bodies, wallet balance, identities, headers or credentials.

The production inventory UI returned `Invalid phone number`. Running the same
GET query in the official playground returned 200 with 25 rows; sanitized schema
inspection showed `did_number` as a safe integer with a 12-digit 91 country prefix
and `country_code=91` as an integer. The adapter had expected string values. This
branch strictly normalizes the observed numeric form and documented E.164 strings;
national/trunk-prefix, foreign, fractional and unsafe integers are rejected. This
fix is fixture-tested against the observed types, not yet deployed. Browse errors
now retain the account/checkout view instead of hiding the entire setup page.

The application's exact server request is GET, fixed HTTPS origin/path, Bearer
header, JSON Accept/Content-Type, no-store, manual redirects and a 10-second
abort signal. The browser playground visibly confirms method/path, configured
Bearer authentication and status. Browser cookie/header bytes and secret equality
were not captured. The earlier connection timeout is no longer reproduced; the inventory route instead exposes the normalization defect described below; region/firewall causation remains unproven.

Shared account, KYC, operator and job routes still ran in IAD1 in the deployed
resource table. The proposed configuration places these VoiceLink callers in
BOM1 too. This also changes the execution region of shared Vobiz account/KYC/job
routes, not their provider routing. Validate both providers after an approved
release. [Vercel per-function regions](https://vercel.com/docs/functions/configuring-functions/region)
are configuration overrides, not proof of a function's deployed location.

## Lifecycle ownership and confirmed documentation

| Step | Owner / implemented behavior | Acceptance gap |
| --- | --- | --- |
| Reseller plan/capacity | Operator; authenticated profile read, independent DID/channel/usage rates | Trial client entitlement and account-specific terms |
| Channel purchase | Operator/provider; exact add-channel API documented, prorated first-month possibility | Paid channel lifecycle, pooling, bounded funding and release contracts; not implemented/enabled in app |
| Client creation | App on owner/admin request; one existing channel, zero wallet/threshold, bypass off; durable username before POST | Real creation/portal email/reset acceptance; old uncertain rows without correlation need support |
| Client recovery | App job/operator; parent profile + exact saved username in parent-owned clients; reset KYC gate | Absence never permits another creation |
| KYC | Client in provider portal; app polls sanitized status | Real identity/legal submission and use-case eligibility require provider/user |
| DID selection/quote | Customer; live inventory read and one durable draft/actual summary implementation | No real draft created in this review; lock timezone and cancellation unresolved |
| Confirm/assignment | App's guarded reseller operations; mandatory renewal and explicit retail acceptance | Disabled; no real paid response or assignment acceptance |
| Checkout recovery | Job/operator; GET saved summary or positive exact client/DID ownership | Missing draft/order reference and unassigned purchase require support; no blind mapping |
| Activation/calls | Existing Gemini, knowledge, tools/modes and shared phone session; provider transport factory prepared | Public VoiceLink admission rejects; no authenticated call contract or live carrier test |
| Renewal/release | Provider auto-renew documentation; customer/operator responsibilities explained | No enabled VoiceLink renewal/release mutation; fees, cooldown and final outcomes unresolved |

The manuals describe individual PAN/Aadhaar and business PAN/signatory Aadhaar/GST
for both client and reseller KYC. Reseller manual additionally describes document
copies, live photo/location and terms/signature steps. All collection remains at
the provider. Assistant purpose does not itself establish legal telecom eligibility.

The purchase manual describes full-month DID charges, prorated initial channels,
minimum one-month subscriptions, and taxes at wallet recharge rather than resource
purchase. These are documentation statements, not a real account invoice. API
confirmation says auto-renew is mandatory; manual toggle guidance conflicts.
No zero release fee, included minutes, cross-client pooling or longer commitment
is inferred. The app now rejects a configured commitment shorter than one month.
See [provider manuals](https://app.voicelink.co.in/documentation/buy-phone-numbers-channels/),
[reseller KYC](https://app.voicelink.co.in/documentation/login-kyc/), and
[client KYC](https://app.voicelink.co.in/documentation/login-kyc-2/).

## Recovery and financial limits

Migration 018 stores an opaque creation username, locked monthly amount and
allowlisted recovery timestamps/codes. No password, token or identity document
is stored. Client recovery requires exactly one parent-owned username match;
provider/client uniqueness prevents cross-tenant adoption. KYC resets blocked.

Checkout recovery never issues POST. It retains the original local deadline,
validates the original account pair, and requires exact DID ID, E.164 and client
ownership. Positive ownership moves the local number to configuration, never
active; wallet holds remain reserved and the ledger remains unchanged. Ownership
absence, provider errors and missing references do not release holds or repeat
purchase/mapping. Paging/time is bounded; unresolved outcomes are surfaced to
operators and the scheduler. Operator suspension is preserved.

An allowlisted operator may close an unpaid local draft only with a VoiceLink
support reference and explicit provider-closure confirmation. The operation is
audited, performs no provider cancellation and rejects every paid/uncertain state
or linked number. Existing operation locks prevent races with customer confirmation.

Operators see separate provider account rows, VoiceLink checkout state, order
reference and last recovery check. KYC/resume dispatch uses the selected or number's
actual provider. Tenant roles cannot authorize operator endpoints. Customer errors
explain recovery; Trial Pack shows its real entitlement blocker instead of falsely
saying capacity is missing. Checkout never advertises active calls.

## Secrets and deployment sequencing

| Service | Secure configuration |
| --- | --- |
| Vercel | VoiceLink `VOICELINK_AUTH_TOKEN`; existing Vobiz master credentials; auth secret, DB URL, matching bridge/encryption secrets; platform Gemini key if managed mode; admin user-ID allowlist; CRON_SECRET; reviewed commercial/retail variables. Nothing provider-private is NEXT_PUBLIC. |
| Render bridge | DB URL; matching BRIDGE_AUTH_SECRET and TENANT_SECRETS_ENCRYPTION_KEY; platform Gemini key when managed mode; PUBLIC_APP_ORIGIN; metrics token. VoiceLink reseller token is not required by the blocked media bridge. |
| Scheduler | TELEPHONY_PUBLIC_ORIGIN and CRON_SECRET matching Vercel only. No DB, Gemini, VoiceLink or Vobiz credential. |

After explicit deployment approval: review/merge PR 17 and this work in order;
back up and apply 017 then 018; verify migration status; release app and bridge;
verify commit identities and actual BOM1 function resources; repeat read-only
profile/inventory/KYC tests; enable an approved scheduler; monitor recovery backlog
and failures. Keep VoiceLink admission and purchase gated until separate live
acceptance. Never temporarily enable Vobiz attestation for VoiceLink.

`vercel.json` contains no active cron schedule. The observed team is Hobby;
[Vercel Hobby cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) is limited to
once per day. `render.reconciliation.yaml.example` prepares a separately approved
five-minute scheduler invoking `scripts/run-telephony-reconciliation.mjs`. It is
not part of the active blueprint. [Render cron jobs](https://render.com/docs/cronjobs)
incur charges and use UTC schedules. The script refuses redirects and logs only
counts; failures, time limits or unresolved VoiceLink reviews exit nonzero for
scheduler alerts. Approval is needed before creating/enabling this service.

Monitor nonzero failures/reviews, stale unknown accounts, unreconciled checkouts,
old pending usage, held funds, provider capacity/balance and deployment mismatch.
Do not automatically retry charged mutations when a monitor alerts. Recovery is
not evidence of invoice settlement; original provider purchase pricing can still
require support review.

## Validation

52 unit tests, lint, TypeScript, production build and bridge health/rejection/shutdown smoke passed. Four disposable PostgreSQL suites passed: Vobiz lifecycle/settlement, VoiceLink recovery, Alpha concurrency and DID exposure. The full 17-test browser suite and focused six-test follow-up passed (the follow-up includes the additional inventory-error regression). Migration 018 was also reapplied in an isolated schema. Automated provider
responses and carrier events are fixtures; databases are disposable direct-
connection schemas. Real evidence is limited to read-only profile/inventory UI,
local DNS/TLS/401, deployment resources/health and migration status. No real
VoiceLink call, webhook signature, live lookup, termination, final CDR, settlement,
purchase, renewal, release or hosted identity acceptance has passed.

The prepared [support request](./voicelink-support-request.md) lists the external
contracts needed for the remaining implementation. It has not been sent.
