# KYC and phone readiness fixes

The `fix/vobiz-readiness-and-ci` change fixes application diagnostics and the
PostgreSQL integration-test transport. It does not claim that Vobiz's mock
endpoint is now available or that carrier acceptance has passed.

## Validation and CI

When `KERALAI_TEST_SCHEMA` and matching `TEST_SCHEMA` identify a disposable
`keralai_test_<16 hex>` schema, the dashboard query helper uses the existing
TCP transaction driver and transaction-local `search_path`. Normal deployments
continue to use Neon HTTP. CI's PostgreSQL/pgvector service therefore works
without a Neon HTTP proxy or live credentials.

Run `npm test`, `npm run lint`, `npx next typegen`, `npx tsc --noEmit`,
`npm run build`, `npm run test:bridge-smoke`, `npm run test:integration`,
`npm run test:did-exposure` and `npm run test:ui`. Database test runners must run
sequentially against the same database: extension creation/removal is database-wide.
CI preserves the integration log as well as UI traces on failure. UI fixtures use
a distinct simulated client address per test so fast local signups do not exhaust
one shared IP’s Better Auth rate limit; production limits remain enabled.

## Diagnose the deployed services

After deploying both services, use Dashboard → Admin → Phone service checks.
The server user-ID allowlist protects `/api/admin/telephony/readiness` before any
workspace or configuration data is read. Each workspace also has its own check
button. Diagnostics disclose boolean checks and version identifiers, never
credentials, document values or widget tokens.

The checks cover the migration 016 columns, app provider credentials, canonical
HTTPS phone origin, app signing secret, reconciliation authentication, approved
prices/policy, environment/platform gates and optional workspace approval,
browser-test completion, account/KYC state, AI and credit. Clicking the check
button makes an optional read-only `/health` request to the configured HTTPS
bridge; it shows the bridge commit and whether its code reports phone setup
version 1. Public health endpoints now report sanitized commit identifiers.

A reachable bridge is not proof of matching secrets or signed callbacks. The
readiness screen explicitly reports `NOT_VALIDATED` for live acceptance. It
cannot verify the bridge's secret values, actual funds, job scheduling, carrier
signatures or human audio quality. Verify those separately. Configuration can be
complete while activation is still blocked.

Expected production origins:

```text
BETTER_AUTH_URL=https://keralai-receptionist.vercel.app
NEXT_PUBLIC_APP_URL=https://keralai-receptionist.vercel.app
TELEPHONY_PUBLIC_ORIGIN=https://keralai-receptionist.vercel.app
BRIDGE_PUBLIC_URL=https://keralai-bridge.onrender.com
NEXT_PUBLIC_BRIDGE_WS_URL=wss://keralai-bridge.onrender.com
PUBLIC_APP_ORIGIN=https://keralai-receptionist.vercel.app
```

`PUBLIC_APP_ORIGIN` belongs on the bridge. `npm run test:config -- --phone` checks
local app/bridge configuration, including canonical HTTPS callbacks and matching
HTTPS/WSS bridge origins; it does not inspect hosting configuration.

## Number search and provider errors

Missing/contradictory global DID policy now raises a configuration error before
requesting inventory. An individual number with missing metadata, invalid prices
or exposure beyond approved ceilings is excluded with a safe aggregate reason
count. The UI explains operator review and permits pagination through the raw
provider inventory. `total` retains the provider's unfiltered total; `hasMore`
explicitly governs pagination. Never interpret it as a count of eligible DIDs.

Provider errors already inherited HTTP 503 before this fix. They now distinguish
access denial, missing account/service, invalid requests and provider throttling.
The response contains a generated support reference. The server event includes
only the internal provider code, operation, HTTP status and uncertainty flag;
provider response bodies, paths containing SA IDs and request payloads are omitted.
KYC/purchase safeguards remain enforced.

## Synthetic KYC 404

The official contract still specifies
`POST /api/v1/sub-accounts/test/{SA}/kyc/verify-pan`. There is no documented mock
hosted-session mirror. The test does not invent endpoints or send real identity
values as a fallback. A 404 can mean a missing account or an unavailable service;
Vobiz must clarify test availability/enablement for this parent account.

`npm run test:vobiz-kyc` requires the existing disposable-account acknowledgement
and ID. It writes a private `.test-output/vobiz-kyc-test-result.json` with safe
operation/status/evidence and a conventional request ID if present. No provider
body, identity values or account token are printed or retained in this result.
The preparation runner persists `testing`, `tested`, `blocked_contract_mismatch`
or `test_failed`, so a failed/crashed test is not blindly rerun.

After Vobiz confirms the supported route and an operator approves retesting the
same reconciled disposable account:

```bash
VOBIZ_KYC_TEST_RETRY_APPROVED=1 node scripts/prepare-vobiz-kyc-test.mjs --retry-prepared
```

A retry still requires pristine initial KYC state and all previous assertions.
This does not create another account, buy a number, enable calling permissions,
submit real documents, or activate signature attestation. The explicit retry
flag authorizes synthetic state writes on the recorded disposable account only.

## Remaining provider and operational work

Resolve the recorded provider 404 and actual callback signature emission with
Vobiz. Validate real hosted PAN/DigiLocker on a distinct approved tester account.
Recover uncertain account creation by checking the parent-owned account and
secure credentials; do not delete local `needs_review` state or recreate blindly.
Review actual DID/release/commitment pricing, parent funding and KeralAI credit.
Only after signed callback evidence enable the signature attestation on both
services and the intended purchase/phone gates. Validate purchase/Application
binding, handset audio and exactly one authoritative CDR debit for two tenants.

The code change does not alter hosting settings or previously configured
readiness flags. No live provider mutation is performed by the new diagnostics.

## Validation for this change

Local validation passed: lint, TypeScript, production build, 30 unit tests,
both database integration suites, the DID exposure regression and bridge
health/unauthorized-token/shutdown smoke. The complete UI suite passed 11 tests;
the final inventory/admin diagnostics pair passed against the final build,
including 320px overflow and deployment-mismatch checks. All test data used
disposable schemas on local PostgreSQL/pgvector; no Vobiz/Gemini calls or
production database writes were performed. GitHub CI is checked on the PR.
