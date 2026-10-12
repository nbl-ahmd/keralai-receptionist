# Closed-alpha implementation report — 2026-10-10

This is the historical initial implementation report. Current 2026-10-11 work
and real Gemini evidence are in [the full Alpha phase record](./full-alpha-phase-record.md).
The full specification is still being implemented; this report does not grant readiness.

The code now supports an invited, platform-funded alpha with per-workspace isolation and server-enforced limits. **This is preparation for controlled staging, not customer-launch or production telephony approval.** No deployment, Google request, real KYC, provider configuration mutation, purchase/release or carrier call was performed. Existing working-tree changes were preserved; no commit was created.

## Architecture

Reused Next.js, Better Auth, tenant tables, encrypted secrets, Node bridge and Vobiz adapters. Shared `bridge/ai-config.mjs` selects credentials; `bridge/entitlements.mjs` controls plans/admission/one-use claim/rolling checks/closure. PostgreSQL holds invitation and usage authority. [Architecture](./alpha-architecture.md) explains the transactional design and current documentation evidence.

## Gemini

Explicit DB `platform_managed`/`tenant_managed` mode, fresh authorization and no cross-mode fallback. New alpha workspaces use the server key; existing workspaces retain their own encrypted key. Each session has separate history/profile/tools. Development/alpha/production labels and test-schema rejection support isolated projects; operator supplies distinct real keys. Daily starts and estimated monthly budgets limit usage. Actual Google billing is not inferred from estimates. Real managed voice response is still unverified.

## Invitations

Hashed random links, email binding, expiry/max uses, revocation and redemption records. Public signup requires an invitation regardless of environment flags. Connection-bound Better Auth/savepoint transaction atomically creates user/workspace/plan/promo and consumes invite. Concurrent last-use and SDK/provisioning failure tests protect atomicity. Raw links return once; hosting logs still need query redaction. Email ownership verification/delivery is not configured.

## Plans

Seeded free Alpha and grandfathered Internal plans. Active per-tenant subscriptions roll at UTC calendar months; overrides are server-authorised and audited. Alpha defaults: 60 phone minutes/month, 60 browser minutes/month, 15 browser minutes/day, one session/channel, ten-minute maximum, 50 knowledge items, ₹250 one-time promo, ₹500 customer spend cap and ₹100 AI estimated budget. No payments, paid recurring subscription or automatic overage.

## Quotas

Global/subscription/wallet row locks serialize admission; reserve the full bounded horizon. One-use claims prevent token replay. Duration and 30-second rolling checks enforce suspension, membership, gates and changed quota/budget/spend limits. Pending CDRs retain reservation; unused browser token expiry costs zero duration, crashed active sessions conservatively consume the lease. Lowering a cap can stop current voice; it does not rewrite historical snapshots.

## Billing

Existing append-only ledger and setup/call holds retained. Activation promo and operator credit are idempotent. Customer call charges are rounded minutes at snapshotted prices; included quota and exact separately stored provider INR cost settle from authoritative matching CDRs. Monthly spend counts negative ledger entries and pending holds/calls. No WS-time debit, speculative refund or monetary retry. [Billing details](./alpha-billing.md).

## Telephony

Answer validates existing signatures/live UUID/DID/KYC, checks entitlements and reserves quota/credit before signed Stream XML. Bridge claims the matching call once and installs guards. Existing mu-law protocol and release/reconciliation contracts remain. Legacy Exotel is restricted to Internal plans, uses browser/AI allowance and obeys the phone switch/duration guard. Real carrier/KYC/provisioning and signature-emission setup remain blocked by [live Vobiz sign-off](./live-vobiz-signoff.md).

## Browser Voice

Available before KYC subject to browser plan/gate, canonical origin, authenticated membership, concurrency and budgets. Ninety-second signed authorization binds a DB session and is claimed once; bridge cannot choose another tenant. Disconnect settles server elapsed browser quota. Relay fixture verifies transcription, audio and interruption; it proves no real model/carrier response.

## Admin

User-ID allowlist only; owner/admin tenant role cannot grant platform authority. Paged tenants, usage/credit, active voice, actual carrier costs, AI estimates/request count and pending settlement age. Reason/reference required for credits, revocation, suspension/resume, gates, plans/subscriptions/quotas and global controls. Admin UI exposes everyday alpha operations; APIs cover additional numeric controls. No provider mutations are implied by these local controls.

## UI/UX

Invite-aware registration and resumed assistant setup; managed AI hides personal-key requirement. Optional explicit BYOK stays in Advanced. Home/Phone/Billing show plan, remaining/used/reserved minutes, credit, concurrency/duration and paused/exhausted explanations. Payments stay disabled. Browser auth uses current origin instead of the build's local URL. Onboarding's rate allowance now supports all seven steps. Existing mobile/navigation/assistant/phone layouts retained.

## Security

Server-only keys, existing encryption, scoped records, canonical mutation origins, role checks, body/rate limits, atomic knowledge caps and readiness checks on both services. Production auth no longer automatically trusts development origins. Removed explicit TLS-certificate-verification overrides from pg pools/migration runner; driver connection configuration applies. Logs record safe authorization events and observational token counts, never key/audio/identity bodies. Configured-secret scan covers current non-ignored commit candidates, not complete Git history.

## Database

Additive 012 AI configuration; 013 invitations/plans/subscriptions/audits/rates and promotional ledger type; 014 global/session/request budget tables and call linkage; 015 overrides/indexes. Existing 001–011 and encrypted BYOK rows preserved. Isolated integration/UI schemas apply all migrations and are dropped afterward. Configured application database migration/result is recorded in validation below. Financial history is never deleted for recovery.

## Environment

Two service envs only: app `.env.local`, bridge `.env.local`; matching templates. `bridge/env.mjs` is the plain-Node loader, not a third config. Hosting uses Vercel/Render process settings. Existing keys preserved; obsolete global mode/shared-code/email allowlist removed. New defaults and blanks added without guessing a Google key, operator identity, commercial prices or provider exposure. See [operator configuration](./alpha-operations.md). All phone/purchase/readiness switches remain disabled locally. The app managed key is empty while the bridge has a pre-existing unverified value; they do not match. No secret was overwritten or copied. Supply the same valid dedicated alpha key to both before the real browser smoke.

## Tests

Phase checks and regression corrections are in [phase record](./alpha-phase-record.md). Integration uses real PostgreSQL with fixture provider fetches; UI uses production Next.js on port 3210 and disposable invites. Dependencies were installed with scripts disabled; audits are classified below. Final command outcomes appear in the validation record.

## Smoke Tests

| Smoke | Evidence / acceptance |
| --- | --- |
| A invitation/signup/plan/one promo | Isolated DB/API and real registration UI; race and rollback included. |
| B managed Gemini response | Resolver, authorization and relay fixtures only. Actual approved staging model/audio response NOT RUN. |
| C BYOK selection | Shared resolver tests and explicit-mode API missing-key/no-fallback checks. |
| D suspended/inactive/gated access | Shared admission and API/bridge fixture regression. |
| E concurrency | Two simultaneous admissions: exactly one; phone second/replay denied. |
| F duration | Shortened independent guard timer and rolling revocation test. |
| G quota | Zero allowance and estimated budget exhaustion deny; reservations count. |
| H wallet | Promo/setup hold/capture/call reservation/CDR settlement fixtures. |
| I duplicate settlement | Repeated authoritative fixture CDR/reconciliation: one immutable debit. |
| J tenant isolation | Foreign token/ID/DID/header and tenant-scoped fixtures; no cross-key/profile sharing. |
| K mobile | 360/390/414 invited onboarding/Home/Assistant/Phone/Billing/Calls; original ten viewports/dialog. |

`npm run test:smoke` is a read-only control-plane/configuration check, with optional health GETs. `--strict` rejects missing operator/key/invitation configuration. It explicitly reports paid/provider/real-Gemini tests NOT RUN. No smoke result grants carrier sign-off.

## Known Risks

Real model/audio and provider behavior remain unverified. Unknown Vobiz signature-emission configuration is a blocker for phone activation. Answer's live/KYC queries may miss provider callback latency targets; measure on staging, never weaken checks. A bridge stop does not prove carrier termination; delayed CDR/call end can overrun reserved credit and require audited negative-balance recovery. The global provider cost counter covers call reservations/CDRs; DID setup/rental/release exposure still needs separate operator commercial approval and monitoring. Shared Google projects have shared quota/outage risk; estimates and highest-observed token metadata are not precise billing. Conservative reservations can deny short tests earlier than users expect.

Email-bound links do not verify mailbox ownership. Invitation, auth/WS query redaction and private evidence retention need hosting configuration. Alpha rate counters require an eventual retention policy; no production scheduler or external alerting was configured. Temporary schema tests exercise race correctness and a small five-request burst, not alpha capacity certification. Hosting cold starts/Neon latency are material: local fixture signup/onboarding can take seconds. Existing two undecryptable tenant keys require their owners to re-enter BYOK; master key was not rotated.

Dependency audit: root 9 advisories (7 high, 2 moderate); production-installed graph 7 (5 high, 2 moderate); bridge 0. Braces/glob and CSS selector parsing advisories occur through Tailwind/ESLint tooling, including tailwindcss-animate peer dependency retained in production installation. Repository CSS/globs are developer-controlled, not compiled from customer inputs; no identified customer-runtime exploit path. Untrusted build/source/plugins can cause DoS. Track compatible upgrades; no forced unrelated redesign. This remains an acknowledged security maintenance risk, not automatically a carrier gate blocker.

## Deployment

Nothing was deployed. Use [operations](./alpha-operations.md) and [deployment](./deployment.md): staging database backup/migrations, actual app/bridge HTTPS/WSS origins, stable shared keys, unique strong auth secret, dedicated Google alpha project, approved limits, allowlisted operator and private metrics. Verify browser first with phone/purchase/signature gates disabled. Rollback disables invitation and DB/env voice/purchase controls, closes active streams as needed, preserves ledger/credentials and additive schema, and reconciles authoritative CDR/ownership before approved recovery. Old public-signup builds must not be exposed as rollback.

## Alpha Launch Checklist

1. Choose operator-controlled staging and its database; back up and apply 001–015. Set matching shared secrets and canonical origins on Vercel/Render.
2. Fill a dedicated alpha `PLATFORM_GEMINI_API_KEY` on both services; select supported model and conservative limits. Set `AI_ENVIRONMENT=alpha`. No customer key copying.
3. Fill app operator Better Auth user-ID allowlist; sign in existing operator, enable invitation issuance, review Alpha plan/one-time credit and platform budget. Keep all phone/purchase/readiness gates disabled.
4. Run full checks and strict read-only smoke on staging. Create ONE email-bound invite in Admin with reason; copy link once and send privately yourself.
5. Tester registers, finishes assistant setup, uses browser voice with approved Google usage, receives intelligible response, and ends session. Inspect usage/reservations/transcript/admin; verify disable/re-enable and second-tenant isolation. Save redacted evidence.
6. Invite a small cohort only after real browser checks pass. Monitor estimates against actual Google billing, errors, concurrency, quota and support requests.
7. Real identity/number/carrier acceptance needs separate explicit approvals and the exact Vobiz A–S/first-call procedure. Do not activate production or claim customer launch from this implementation.

## Final validation record

Results are recorded after all commands and cleanup complete. Ignored `.test-output/` contains detailed local evidence; it is not a commit candidate.


| Command / check | Final result |
| --- | --- |
| `npm install --ignore-scripts` (app and bridge) | Passed; no forced dependency upgrade. |
| `npm run lint` | Passed. |
| `npx tsc --noEmit` | Passed. |
| `npm run build` | Passed, including final sign-in body-limit guard; production webpack/TypeScript/routes. |
| `npm test` | 15 passed, 0 failed. |
| `npm run test:integration` | 2 broad isolated real-DB/API/provider-fixture scenarios passed; 254.2 seconds. |
| `npm run test:ui` | 8 passed, 0 failed; 8.6 minutes. Three real invited mobile onboarding paths, ten viewport sizes, phone states, keyboard dialog and managed-key UI. |
| Bridge syntax and unit transport/guard/relay checks | Passed. |
| Fresh bridge smoke | Health 200; protected metrics 200; no-token metrics 401; unsigned phone WS 401; browser/phone counts zero; memory/event-loop metrics present. No Google/provider request. |
| `npm run migrate` / `migrate:status` | Applied additive 012–015 to configured development DB; all 001–015 applied. Thirty existing workspaces remain Internal/BYOK. |
| `npm run test:smoke` | Read-only DB/schema checks passed; reports missing app platform key/operator user-ID allowlist and disabled invite issuance. Real Gemini/provider operations explicitly NOT RUN. |
| `npm run test:smoke -- --strict` | Correctly rejects the three unresolved operator configuration blockers; not an implementation test failure or launch pass. |
| Dependency audit | Root 9; production graph 7; bridge 0. Exploitability/relevance classified above. |
| Configured-secret scan | 249 non-ignored commit candidates; zero configured-secret matches. Env files/evidence/prompt remain ignored. |
| `git diff --check` | Passed. |
| Cleanup | One stale disposable fixture schema removed; zero test schemas/public fixture users/public alpha invites/public alpha sessions. |
| Readiness state | App/bridge attestations and phone/purchase env switches 0; DB phone/purchase controls false. |

The small concurrency fixture admitted one of two simultaneous sessions in 4.674 seconds; five parallel authorization requests all passed in 3.660 seconds. These measure remote fixture control-plane correctness, not carrier latency or supported production concurrency.

Initial regression failures were corrected before sign-off: same-origin browser auth, seven-step onboarding rate limit, remote-DB assertion/long-scenario timeouts, fixture WebSocket typing and the isolation test's incorrect 403 expectation (existing membership fallback safely returns own data). Final valid browser flows ran on the final auth-origin implementation; the subsequent oversized-sign-in rejection was verified by its dedicated unit test and final build.

**Commit decision:** suitable for a reviewed commit with secrets excluded and readiness disabled. **Alpha access decision:** do not invite testers until the operator configures both services, passes strict staging preflight and records an approved real browser Gemini response. **Customer launch/production phone decision:** NOT APPROVED; actual Vobiz KYC, provisioning, signature emission and carrier audio remain unverified. No commit or deployment was performed.
