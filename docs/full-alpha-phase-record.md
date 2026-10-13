# Full Alpha phase record — 2026-10-11

Work is on `feat/full-alpha`. The operator requested the order A–I in
[the specification](./FULL_ALPHA_IMPLEMENTATION.md). Live acceptance is distinct
from fixture coverage. No deployment or production readiness activation is authorized.

## A — branch, CI and readiness audit

Fetched `origin` and merged current `origin/main` (`1e43bdb`). The branch's
`a3a4c77` and main's `a661b6b` contain identical trees. The merge preserves both
histories; no force push or source replacement was used.

Read repository instructions, all specified implementation/operational docs,
migrations 001–015, Alpha invitations/plans/AI/session controls, wallet and
telephony orchestration, provider adapters, bridge/browser transport, admin
APIs and existing tests. Reuse these systems in subsequent phases.

Added GitHub CI with Node 22, installs for both services, lint, Next type
generation, TypeScript, unit tests, bridge/script syntax, production build,
isolated PostgreSQL/pgvector integration and Chromium UI tests. CI has no live
Gemini/Vobiz credentials and never invokes the live-model smoke. Remote CI
execution is pending publication of a reviewed branch/PR.

Added `npm run test:config` to compare effective app/bridge keys without
printing values or fingerprints. Strict checks distinguish browser configuration
from phone configuration and explicitly do not infer live acceptance. Extended
read-only smoke to include this check and optional parent-auth/balance GETs with
`--provider-readonly`. Existing signature checks remain unchanged.

Removed raw SDK error serialization at Gemini/browser failure boundaries;
bounded status/classification logs cannot include nested request credentials.
Regression tests cover mismatched service secrets and provider-error redaction.

Official installed Vobiz skills are in `.agents/skills/{sub-accounts,partner-api,
phone-numbers,applications-endpoints,voice-calls,voice-xml,audio-streams,cdr}`.
Current MCP `query_docs_filesystem_vobiz` was called over HTTPS at
`https://www.vobiz.ai/docs/mcp`. The current balance, inventory and callback
contracts were read. Callback signature emission still requires account-specific
credential configuration and real evidence. No API field or bypass was invented.

Read-only live parent authentication and INR balance GETs returned 200; balance
status is active and available funds positive. This does not approve any spend.
Provider mutations: none.

Audit findings for later phases: Alpha subscriptions currently default purchase
enabled; no separate default-off phone activation approval, DID exposure ceilings
or provider balance floor exist. DID spend is absent from global provider cost
reservations. Customer release still reaches the paid provider operation.
Feedback/credit-request records and rate-limit retention are absent. Existing
KYC/provisioning/call/immutable CDR infrastructure must be extended, not replaced.

## B — managed Gemini acceptance preparation

The user approved a small real Gemini test budget of ₹500 and confirmed a key
was configured. The existing bridge key was configured in the empty app setting;
no credential value was printed, committed or moved into tenant secrets. Both
services now match. A read-only Google model listing returned 200 and includes
`gemini-3.8-live` (the existing default).

`ALPHA_LIVE_GEMINI_APPROVED=1 npm run test:gemini-browser` explicitly invokes real
Google Live through authenticated invited browser sessions in a disposable
schema. It removes Vobiz credentials, disables phone/purchase/attestation gates,
uses two distinct tenant identities, synthetic microphone input, English and
Malayalam, 45-second maximum sessions and a ₹500 estimated global AI ceiling.
It asserts actual received audio/transcripts, no foreign identity, closure/quota
settlement and browser access with no KYC account. This is never run by CI.
Google billing remains the authority for actual spend; estimates are not money
transferred to a provider or a substitute for project billing controls.

Real Gemini acceptance passed for two isolated invited tenants. English and
Malayalam greetings produced real audio and transcripts. Spoken microphone input
asked each tenant for its next workshop day. Actual knowledge searches returned
Wednesday for Cedar and Thursday for Lotus; the fixture rejected foreign facts.
Both sessions reported interruption, closed, settled and had no KYC account.
Sessions lasted 15 seconds each in the spoken run. Provider billing remains the
authority for actual spend; no claim of measured INR cost is made.

The live run exposed and fixed: lost startup frames during asynchronous tenant
loading; premature connected state before model setup; microphone/model sessions
remaining open after modal unmount; shutdown persistence after pool closure.
Bounded startup queues, SDK setup completion, cancellation cleanup and tracked
shutdown writes now have regression coverage. Human microphone/intelligibility
and real-device acceptance remain pending.

The operator's locally configured email matched exactly one auth account and was
resolved to its internal ID. No identity or key was printed. Existing audited
`platform_controls` set the application's monthly estimated AI ceiling to
50000 paise under the explicit INR 500 approval. Phone gates were not changed.


## C — phone approval and funding controls

Additive migration `016_alpha_phone_approval.sql` gives subscriptions default-off
phone activation approval and numbers conservative provider exposure/setup-charge
snapshots and a local release-request marker. It preserves existing immutable
wallet rows and uncertain purchase holds. Migration is validated in disposable
schemas; application-database application is recorded separately in release status.

Reused the shared entitlement resolver and audited Alpha admin action/UI for
`phone_approval`. Revoking it blocks future activation; existing calls/numbers are
not released. Browser use remains available. Inventory and purchase re-check
approval through the existing capability authority.

New DID policy validates explicit voice availability/restrictions, INR setup and
monthly costs, commitment ceilings and account-confirmed release exposure.
Missing metadata/policy fails closed. Read-only real inventory GET returned 200
and confirmed required metadata fields; no inventory DID was purchased. Runtime
release quotes can only increase the approved account-pricing reservation.
Parent INR balance is freshly read before purchase. Under the existing platform
row lock, DID and carrier reservations must fit the global provider ceiling and
conservative balance floor. Legacy unknown DID exposure blocks provider spending.
No parent-balance polling is used to cut off accepted calls.

New activation captures separate setup and rental ledger entries with deterministic
keys. Legacy combined entries stay immutable. Customer release now stores one
local, audited operator-review request; it performs no paid DELETE and changes no
call routing. Sponsored-credit wording makes clear that testers never pay Vobiz
and testing credit has no cash/withdrawal value. Customer payments remain disabled.

Unit (22 passed), lint, type and production-build checks pass. Final expanded
integration: 2 passed, 0 failed, 286038.929875 ms. This includes no mutation before
cost/funding rejection, separate immutable setup/rental capture, tenant-scoped
idempotent release requests with zero paid DELETEs and phone summary loading
before managed AI is configured. Expanded UI: 9 passed, 0 failed (9.0 min), including default-off approval and
direct purchase denial at 360/390/414 px. An additional real-DB exposure check
passed (1 test, 19860.681333 ms): unknown release fees in the current month stay
blocked, known release exposure remains, historical released exposure falls out
and uncertain purchases stay reserved. CI runs this in a separate schema.

## D — next operator boundary

A new disposable individual customer_use SA is required for official mock KYC.
No suitable disposable account is configured. A concrete creation/test-only
approval request is pending. No provider record was created and no real identity
was submitted. Follow the approved test sequence in `live-vobiz-signoff.md`,
then use a distinct real account for hosted PAN/DigiLocker after operator approval.

Phases D–I are not complete. Do not label this branch full Alpha, Beta or public
ready. Phone signatures, real KYC/DID/application/carrier/CDR acceptance are pending.

Final cleanup: zero temporary test schemas remain. Current non-ignored candidate
secret scan: 276 files, zero configured-secret matches. App/bridge health 200.
Readiness smoke exits 1 for pending 016 and disabled invitation issuance/acceptance
configuration; this is an expected NOT READY result, not a launch smoke pass.
All phone/purchase/readiness gates remain off. No provider mutation or production
deployment occurred. Current report: [release readiness](./full-alpha-release-readiness.md).

## 2026-10-12 — continued phone readiness

Operator approved migration application to the configured development/staging DB
and one synthetic-KYC disposable account, then approved a unique operator email
plus alias after a rejected 409/confirmed empty parent list. 016 applied. One
customer_use/individual disposable SA was created, calls disabled, no DID or
retained credential. Provider status response differed from published docs; a
strict dual-schema adapter now requires authenticated parent-owned identity and
literal provider gate for the flat response. Real read-only adapter validation
passed with pending/not_started documents and calls blocked. Mock PAN POST at
the documented test-mode path returned 404; provider acceptance is BLOCKED, not
passed. No real identity or paid operation occurred. See
[exact evidence and provider clarification draft](./phone-alpha-provider-blockers.md).

Alpha KYC account/session creation now requires active subscription, explicit
operator phone approval and bridge-recorded browser completion. A client step
cannot set that completion marker. Browser and KYC availability remain independent
of paid carrier readiness, preserving the staged flow. KYC pending/cancelled UX
is recoverable. Phone status now consults the actual shared admission gate and
never claims incoming calls are ready merely because a DID and credit exist.

User selected existing production origins; both health GETs returned 200. Phone
origins are prepared locally. No production deploy, hosting env modification,
provider callback change, signature attestation, DID purchase/release or carrier
call was authorized or performed. Initial native capture failed; the subsequent
Chrome connection succeeded. Read-only console inspection confirmed trial status,
₹25 balance and zero Voice Applications. The create form has no dedicated callback
auth fields and was cancelled without saving. Support clarification is drafted;
the operator chose to send it personally. No message was sent or console setting changed.

Phase-D unit: 24 passed, 0 failed; sequencing integration: 1 passed, 0 failed
(150478.985584 ms); full UI: 10 passed, 0 failed (9.1 min); full integration:
2 passed, 0 failed (280489.046334 ms). Corrected readiness-display regression:
2 UI passed, 0 failed (53.7 sec); complete integration 2 passed, 0 failed
(289639.250875 ms). Later phases remain unfinished.

Continuation bridge audit found phone close/start persistence and usage closure
were not consistently registered with the existing graceful-shutdown drain.
They now reuse tracked background work, including Gemini drop, stop, setup failure
and socket close. Error logs retain bounded classifications rather than SDK errors,
provider-controlled close reasons or setup error messages. Unit and syntax checks
pass; complete integration rerun: 2 passed, 0 failed (273416.721833 ms).
No billing authority changed. Repeatable `npm run test:bridge-smoke` now starts
a local bridge with fresh fixture signing/encryption keys, no AI/provider keys
and disabled paid gates, verifies health 200 and invalid phone token 401, then
requires graceful SIGTERM exit 0. It passed and is included in CI. It creates
no tenant records and makes no authenticated session/provider calls; it does
not establish active-call drain or carrier audio acceptance.
Hosted read-only smoke returned app/bridge health and parent auth/balance HTTP 200.
Local-health smoke failed because configured localhost services were stopped;
this was corrected by selecting the already approved hosted health origins.
Final schema cleanup: zero remaining test schemas. Support ticket was not sent;
the unsent editor was cancelled and the clarification remains in the blocker doc.

Hosted environment preparation preserved existing shared secrets/database;
the operator approved this database for hosted closed Alpha. Private Git-ignored
Vercel/Render copies use HTTPS/WSS origins and Alpha AI configuration. On the
subsequent request to make features available, operator invitation issuance was
enabled locally and in the Vercel copy; signup still requires a hashed invitation.
A read-only inventory refresh returned ₹100 setup, ₹500–600 monthly, ₹700 release,
zero minimum commitment. Operator explicitly confirmed only zero commitment,
which is configured. Other monetary limits and both per-minute rates remain
pending confirmation. No hosting deployment, actual invite creation, purchase,
carrier call or callback attestation was performed.

The operator subsequently confirmed the proposed setup/monthly/release amounts
and balance floor, and requested official Vobiz lookup plus a small margin for
per-minute credit accounting. Official docs MCP identified authenticated
`GET /api/v1/auth/me`; the live read-only response returned INR ₹0.38/minute,
60-second billing increment, zero minimum duration. Credentials were discarded.
All ten configuration fields are now filled: setup ₹100, monthly ₹600, release
₹700 cost/ceiling, zero commitment, ₹1,400 balance floor, ₹0.42/minute sponsored
debit and ₹0.50/minute provider reserve. Rates and limits were applied to the
appropriate local and hosting-copy files. Existing Gemini estimate/budget is
unchanged. Full phone acceptance still awaits KYC/signature evidence and the
separately approved funded DID/carrier/deployment actions. No paid gates changed.
