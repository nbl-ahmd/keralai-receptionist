# Full Alpha release readiness — 2026-10-12

Current status: **Not ready**. This is a progress report for phases A–C and the
continued Phase D implementation, not completion of the full specification.
Phase D real acceptance and phases E–I remain unfinished. No Beta/public readiness is claimed.

The implementation and phase evidence are in the
[phase record](./full-alpha-phase-record.md). The previous report is historical.

## Architecture changes

Merged current origin/main on feat/full-alpha and added secret-free GitHub CI.
Added app/bridge configuration checks and sanitized provider-error boundaries.
Reused existing invitation, managed/BYOK AI, tenant/auth, plan/quota, wallet,
Vobiz, bridge and platform-admin systems. Real Gemini browser acceptance found
and fixed startup ordering, premature connection state, modal microphone/model
leaks and shutdown persistence. English/Malayalam greetings and spoken knowledge
queries passed for separate tenants before any KYC.

## KYC

Existing provider-hosted individual PAN/DigiLocker, expiry/restart, per-document
status, signed callback and authoritative calls-blocked logic remain. The approved disposable customer_use/individual account was created with calls
disabled and no DID. Its live KYC status differs from the published aggregate
contract; the adapter now validates the observed flat response using a fresh
parent-owned account identity and literal provider call gate. The official mock
PAN endpoint returned HTTP 404, so test-mode acceptance did not pass. Real
hosted PAN/DigiLocker remains unexecuted. New server checks require operator
approval and bridge-recorded browser completion before invited Alpha users can
create a provider account/hosted session. Client onboarding steps cannot supply
that marker. KYC availability is separate from carrier activation readiness.
See [exact provider evidence and required action](./phone-alpha-provider-blockers.md).

## Phone numbers

New Alpha approval defaults off and is audited in existing admin controls.
Inventory/purchase revalidate capability and configured setup/rental/release/
commitment ceilings. Missing metadata fails closed. A live read-only inventory
GET returned 200 and confirmed current metadata fields. New activation checks
fresh INR parent funding and serializes DID/carrier exposure with wallet holds.
Existing uncertain purchase/routing recovery is reused. No real DID was bought,
bound, released or called. Customer release now creates a local audited request;
it performs no provider DELETE. Complete provisioning/recovery acceptance is
still required in phases E/F/H.

## Alpha funding

Operator funds Vobiz/Gemini. Testers receive sponsored KeralAI testing credit,
never pay Vobiz and have no cash/withdrawal entitlement. Customer payments remain
disabled. See [funding policy](./alpha-funding-model.md). New setup and initial
rental debits have separate deterministic ledger keys; historical rows stay
immutable. Conservative DID commitments are included in provider budget
reservations alongside calls. The approved application's AI estimate ceiling
is INR 500 (50000 paise); actual Google billing must be checked separately.

## Calls and existing features

| Flow | Evidence to date | Remaining acceptance |
| --- | --- | --- |
| Invited signup, tenant isolation, one promo | DB/API and browser fixtures | Complete cohort checklist after D–H |
| Managed browser voice, English/Malayalam | Two tenants, actual Google audio/transcripts | Human microphone/audio quality, real-device acceptance |
| Tenant knowledge | Actual Google embedding/tool lookup: Wednesday vs Thursday | Full core-feature matrix on both channels |
| BYOK, suspended/revoked/gated usage, quotas | Existing shared resolver/DB/relay fixtures | Complete final feature audit |
| Hosted KYC and status | Local fixtures; strict flat live status validated on one disposable account | Official mock POST returned 404; real hosted acceptance pending |
| DID/Applications/signatures/WSS/media/CDR | Existing local integration/relay/signature coverage | Two approved real tenants, carrier calls, authoritative CDRs |
| Messages/appointments/callbacks/modes/summary/transcripts | Existing code/tests retained | Phase G full browser + phone matrix |
| Recovery/rental/idempotent billing | Existing isolated integration | Phase H audit and approved provider acceptance |
| Feedback, credit-request records, retention/monitoring | Not completed | Phase H implementation |

## Usage, admin and feedback

Reused quota leases, holds, immutable promo/call/rental ledger and CDR settlement.
Operator user-ID allowlist now resolves one existing sign-in account. Approval
and revocation require reason/reference. They never release owned numbers.
Release requests are idempotent and tenant scoped. Feedback/credit-request and
remaining operator recovery/monitoring/retention work is still outstanding.

## Mobile and security

Browser tests cover onboarding/dashboard/phone/billing/calls at mobile widths;
expanded results are recorded below. Managed keys remain
server-side and match both services. No credentials/identity/audio payloads were
logged or committed. Tenant context is authenticated; provider readiness and
signature verification were preserved. Public signup/customer payments remain
disabled; invitations are not issued externally. No production deployment or
callback/readiness activation occurred.

## Database and environment

New additive migration: `016_alpha_phone_approval.sql` (approval, provider
exposure/setup-price snapshots, release-request marker). All existing migrations
001–015 remain untouched. 016 is applied in disposable test schemas and **applied successfully to the
operator-approved development/staging application database** on 2026-10-12.
Production code deployment remains unapproved.

New app-only policy variables, documented blank in `.env.local.example`:
`ALPHA_MAX_DID_SETUP_COST_MINOR`, `ALPHA_MAX_DID_MONTHLY_COST_MINOR`,
`ALPHA_DID_RELEASE_COST_MINOR`, `ALPHA_MAX_DID_RELEASE_COST_MINOR`,
`ALPHA_MAX_DID_COMMITMENT_MONTHS`, `ALPHA_MIN_VOBIZ_BALANCE_MINOR`.
Use actual operator-approved pricing; fixture values are not recommendations.
Managed keys and signing/encryption/database configuration match. Operator
allowlist was resolved locally without printing credentials. Phone origins were prepared locally using the user-selected production URLs;
both remote health checks returned 200. No hosting settings were changed.
Local acceptance still needs AI_ENVIRONMENT=alpha and approved invitation issuance; phone gates
and provider attestation remain off. No policy price was guessed or enabled.

## Validation

The following checks ran against the A–D code increments. They do not substitute for
the final full-specification validation after phases D–I. Evidence is in ignored `.test-output/`:

- Root/bridge npm ci: passed; no dependency changes since installation.
- Lint, TypeScript and production build: passed.
- Unit tests: 24 passed, 0 failed (649.444625 ms on the recorded D run).
- D sequencing integration: 1 passed, 0 failed (150478.985584 ms).
- Earlier full integration: 2 passed, 0 failed (280311.016625 ms).
- Final integration with release-request/unconfigured-AI regressions: 2 passed,
  0 failed (286038.929875 ms).
- Focused real-DB DID exposure regression: 1 passed, 0 failed (19860.681333 ms);
  unknown current-month release costs never free budget, and historical released
  exposure expires from the current window. CI runs this in its own schema.
- Earlier full browser UI: 9 passed, 0 failed (8.4 min).
- Earlier expanded approval/mobile UI: 9 passed, 0 failed (9.0 min).
- D full UI: 10 passed, 0 failed (9.1 min).
- Latest focused readiness UI: 2 passed, 0 failed (53.7 sec).
- Complete D integration rerun: 2 passed, 0 failed (289639.250875 ms).
  Subsequent bridge shutdown tracking rerun: 2 passed, 0 failed
  (273416.721833 ms). Latest unit rerun: 24 passed, 0 failed (607.2905 ms).
- New `npm run test:bridge-smoke`: passed. Local bridge health 200, invalid phone
  token 401, graceful SIGTERM exit 0. Fresh fixture signing/encryption keys;
  no AI/provider keys, paid gates disabled, no records created. Added to CI.
  Active carrier-call drain acceptance remains pending.
- Two new test fixture errors were corrected: active readiness had been asserted
  before activation, and the focused phone UI case relied on an earlier signup.
  The fixes preserve all real admission/readiness gates.
- Actual Gemini greeting and spoken-knowledge smokes: 2 tenants passed each;
  caller input, actual knowledge tool execution, interruption, audio/transcripts,
  closure and settlement validated. Human audio-quality smoke not run.
- Read-only Vobiz parent auth, INR balance and inventory: HTTP 200. Not spend
  approval, KYC or telephony acceptance.
- Migration status: 001–016 applied in the approved application database.
- Read-only DB/health smoke passes with all five Alpha migrations. Strict
  acceptance configuration still fails on disabled invitation issuance, development
  AI environment and missing approved policy/gates;
  app/bridge health HTTP 200; phone/purchase DB gates false, attestation false.
- Dependency audit: root 9 findings (7 high, 2 moderate); bridge 0. Existing
  tooling advisories remain; no forced dependency upgrade was performed.
- Configured-secret scan: 276 non-ignored text files, 0 matching files;
  not an audit of complete Git history.
- Bridge/script syntax and git diff --check: passed.
- Test schemas are dropped by runners. Final read-only cleanup query: 0
  remaining keralai_test_% schemas; phone/purchase gates false, attestation false,
  monthly estimated AI ceiling 50000 paise.
- Remote CI is not executed until the branch/PR is published.

## Live operations still required

Disposable creation/test approval was granted and exercised; the test is blocked
by the documented mock endpoint returning 404. Provider clarification is required. Real hosted KYC, account-specific
callback-signature evidence, approved funding/prices, a capped self-service DID
activation/Application binding, two distinct real tenants' short handset calls,
clear audio/barge-in, final authoritative CDRs and recovery/rental acceptance
have not passed. Each provider mutation requires separate explicit approval.
Do not set readiness flags to discover whether signatures work. No provider
balance transfer or customer payment activation is planned.

## First tester checklist

Do not invite a cohort until phases D–H and manual acceptance pass.

1. Review the branch, complete CI and approve a staging environment. Verify 016
   is applied there before starting the changed app/bridge. Keep production unchanged.
2. Configure matching server secrets and a dedicated capped Alpha Gemini project;
   resolve operator user IDs, AI_ENVIRONMENT=alpha, canonical HTTPS/WSS origins
   and server invitation issuance. Keep public signup and customer payments off.
3. Complete a human browser voice test before KYC: profile, English/Malayalam,
   microphone permission/reconnect, interruption, isolated knowledge and closure.
4. Execute approved disposable mock KYC; then a distinct real operator-controlled
   hosted PAN/DigiLocker flow. Verify authoritative active account/calls gate.
5. Obtain actual callback-signature emission evidence without weakening checks.
   Approve specific staging readiness activation only after that evidence.
6. Review actual DID setup/rental/release/commitment costs and parent funding.
   Set approved ceilings/floor; grant an audited sponsored credit and phone
   approval for the specific tester. Do not transfer Vobiz money to testers.
7. Tester selects live inventory and activates once in KeralAI. Confirm provider
   ownership/Application binding and local active/captured setup+rental state.
8. Make an explicitly approved handset call under 60 seconds. Check correct
   assistant, tenant knowledge, tools, interruptions, transcript/summary and
   exactly one authoritative CDR debit. Repeat acceptance for a second tenant.
9. Finish core-feature/recovery/monitoring/feedback/retention checks. Confirm zero
   unexplained pending holds/CDRs; preserve all billing/audit history.
10. Only after acceptance, create 3–5 email-bound single-use invitations in Alpha
    admin with reasons/references. Start browser-only and approve phone access
    individually. No invitation or external message has been sent by this work.

## Merge and readiness decisions

Safe to merge as the requested full Alpha release: **No**. The complete
specification, remaining final validation and live acceptance are not finished.
The A–D code increment can be reviewed separately with migration rollout planning.
Browser Alpha ready for testers: **No**; real-model smoke passed, but configuration,
human-device acceptance and operational/cohort work remain.
Full phone Alpha ready: **No**. The mock API blocker, callback signature emission,
real hosted KYC, approved pricing/DID purchase, real carrier/CDR acceptance and
remaining phases are outstanding. Production app/bridge health 200 is only
reachability evidence. See the [feature evidence matrix](./alpha-feature-matrix.md)
and [exact provider blockers](./phone-alpha-provider-blockers.md).
