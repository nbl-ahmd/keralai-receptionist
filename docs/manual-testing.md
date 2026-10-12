# Manual testing

Closed-alpha and retained developer test matrix covering authentication, tenant isolation, secrets,
runtime modes, bridge routing, and mobile PWA behaviour.

Use two accounts: **A** and **B**. Record results as you go.

## Automated checks first

```bash
npm run migrate:status   # confirm 001–016 are applied
npm run build            # production build
npm run lint             # eslint
```

The bridge files can be syntax-checked with `node --check bridge/server.mjs`.

## Authentication and provisioning

1. **Register invited user A.** Use a new operator-issued email-bound invitation. Confirm A lands in the dashboard and receives tenant A
   (Settings → workspace name; `/api/tenant` returns a tenant with role `owner`).
2. **Register invited user B.** Use a distinct invitation. Confirm B receives a different tenant with role `owner`.
3. **Sign out and back in** as each user; confirm the session persists and the
   dashboard reloads with the correct tenant.
4. **Unauthenticated API access.** While signed out (or in a private window),
   request `/api/company-profile`, `/api/knowledge`, `/api/calls`, `/api/modes`,
   and `/api/tenant`. Each must return **401** (not data, not 500).
5. **Direct page access.** Open `/dashboard` while signed out; middleware should
   redirect to `/login?next=/dashboard`.

## Tenant isolation

6. **Knowledge.** Add knowledge item **X** to A. Query B's knowledge list and
   knowledge search; **X must not appear**.
7. **Company profile.** Set a distinctive profile field for A. Confirm B's
   `/api/company-profile` does not contain A's value.
8. **Cross-tenant header.** As B, call `/api/company-profile` with
   `x-tenant-id: <A's tenant id>`. The server must ignore/deny it (B must not
   receive A's data) — expect normal B data or `403`, never A data.
9. **Calls.** Generate/seed a call for A. Confirm B's `/api/calls` does not list
   it.
10. **Contacts / appointments / inbox.** Create a contact, appointment, callback,
    and message for A. Confirm none are visible to B.
11. **Embeddings.** Add searchable knowledge to A only, then search as B. B must
    never receive A's matches.

## Secrets

12. **Optional BYOK:** explicitly select own-key mode in Advanced → AI connection for A, then save the key. Confirm the UI/API show
    only `configured`, `provider`, `keyName`, `maskedSuffix`, timestamps — never
    the key.
13. **Confirm B cannot retrieve A's secret.** As B, read A's tenant secrets via
    `/api/tenant/secrets` scoped to A's tenant id (if attempted) and inspect B's
    own list; A's key material must never appear.
14. **Secret rotation.** Replace A's key with a new value. Confirm the masked
    suffix changes, the old value is unrecoverable, and voice still works.
15. **Logging.** Trigger a session and inspect bridge/app logs for API keys,
    tokens, or encryption keys. None must appear.

## Runtime modes and instructions

16. **Activate "Meeting" for A.** Confirm the dashboard header shows the active
    mode and (if set) the expiry.
17. **New A voice session receives Meeting instruction.** Start a live session as
    A and confirm the assistant reflects the meeting state.
18. **B does not receive A's mode.** Start a live session as B; B must not be
    told about A's meeting state.
19. **Mode expiration.** Activate a mode with a short expiry (e.g. 1 minute for
    testing). After it passes, confirm the dashboard shows Available and a new
    session no longer injects the mode.
20. **Custom mode + active instructions.** Set a custom mode and add an active
    instruction for A; confirm both are honored and that the instruction does
    **not** appear in normal knowledge search results.

## Bridge routing

21. **Browser voice token.** Generate A's browser voice token; confirm the
    connection succeeds and is attributed to A's tenant.
22. **Cross-tenant token.** Take B's token and tamper/transfer it to attempt A's
    tenant (e.g. add `?tenantId=<A>`); the bridge must use the token's tenant and
    reject the mismatch attempt. Expired or malformed tokens must return **401**.
23. **Internal-plan legacy fixtures only:** Exotel requires the global phone switch, session quota and duration guard; new Alpha tenants must be denied. **Exotel A URL.** Request A's Exotel URL from Settings → Providers. Connect
    with A's slug + token; confirm the call resolves to A. Test all accepted
    token channels: `?token=`, the malformed `?token:<token>=` key, an
    `Authorization: Basic` header (`tenant:<token>`), and a trailing
    `/ws/exotel/<slug>/<token>` path segment.
24. **Exotel B URL.** Repeat for B; confirm B's call resolves to B and never to A.
25. **Exotel hardening.** Call `/ws/exotel` with no slug (expect `404`), an
    unknown slug (expect `404`), and a wrong token (expect `404`). Rotate A's
    token and confirm the old URL stops working.
26. **Exotel account credentials.** In Settings → Providers → Exotel account, save
    A's Account SID / API key / API token and click **Test connection** (expect a
    connection result using A's own account). Confirm B cannot see or read A's
    Exotel credentials through any settings or API response, and that A's and B's
    credentials are stored independently.

## Authorization and data ownership

27. **Role checks.** With an `owner` account, exercise owner-only actions. If you
    can create an `admin`/`member` membership manually, confirm those roles are
    restricted appropriately (expect `403` where not permitted).
28. **Call data stays tenant-scoped.** Complete or seed calls for A and B;
    confirm every transcript turn, metric, log, booking, and CRM event is only
    reachable from its own tenant.

## Mobile and PWA

29. **Small widths.** Check the dashboard, settings, calls, and knowledge pages
    at **320, 360, 375, 390, and 414 px**, plus tablet and desktop. No horizontal
    overflow; all interactive targets ~44px or larger.
30. **Bottom navigation.** On a phone width, the fixed bottom nav appears and
    switches tabs; it is hidden at `lg`. Content is not hidden behind it.
31. **Active mode visibility.** Confirm the current mode and expiration are
    visible on the dashboard and the one-tap controls (Available, Meeting,
    Driving, Sleep, Focus, DND) work.
32. **Installability.** In production, the manifest loads and the app is
    installable. The service worker registers and caches only
    `/_next/static/` and icons.
33. **No cached auth data.** Confirm `/api/*` responses and WebSocket traffic are
    never served from cache, and signing out does not leave stale authenticated
    pages.

## Definition of done

- All automated checks pass.
- Every isolation check above confirms no cross-tenant leakage.
- No secret material appears in logs or API responses.
- The dashboard is usable from 320px up to desktop with no overflow.
- `docs/` accurately describes the shipped behaviour.
## Managed telephony acceptance

The implementation is wired; release is gated on real provider acceptance. No platform Vobiz credentials were available during local implementation, so do not interpret fixtures as a successful hosted KYC, real purchase or live carrier audio test.

### Automated commands

```bash
npm ci
npm run migrate:status
npm run migrate
npm run lint
npm run build
npm test
npm run test:integration
npx playwright install chromium
npm run test:ui
```

Integration/UI runners create `keralai_test_<random>` schema, apply migrations 001–010, use the direct database endpoint for pg/schema setup, set Neon HTTP schema transaction-locally, and drop the schema in `finally`. A schema assertion refuses test fixtures outside that namespace. Never set `KERALAI_TEST_SCHEMA` in production. UI tests start the production build at port 3210 and authenticate against real Better Auth; phone states are clearly test fixtures, not production fake inventory.

Unit tests cover the strict KYC gate, E.164, rounded integer billing, phone/browser token scope/expiry/tampering, exact raw KYC HMAC, URL+nonce voice HMAC, secure escaped XML, mu-law vectors/round trips and media/playback/clear/checkpoint behavior.

Database integration covers two registrations and distinct tenants/SA accounts; encrypted separate credentials; profile/knowledge/call/secret metadata isolation; blocked not_started/pending/failed/verified gates; expired-session restart; duplicate KYC webhooks; setup failure and hold capture; repeated purchase; cross-tenant number denial; member mutation denial; unauthenticated/admin denial; signed DID routing and one-use bridge nonce; duplicate hangup/CDR debit; immutable ledger; release; provider timeout after remote purchase with ownership reconciliation; idempotent beta adjustments.

Browser acceptance visits Phone, Assistant, Settings and Calls at 320×568, 360×800, 375×812, 390×844, 414×896, 768×1024, 1024×768, 1280×800, 1440×900 and 1728×1117. It checks onboarding redirect/resume, visible page content and horizontal body overflow, and captures `.test-output/` screenshots. Separate mobile states cover pending/expired verification, failed setup, active number and API failure. Review screenshots, keyboard/focus traversal, touch targets, bottom safe-area padding, dialogs and virtual keyboard on a real device as well; Chromium desktop emulation cannot prove native keyboard/PWA behavior.

### Real provider test mode

Use a NEW disposable individual customer-use SA with no production DID:

```bash
VOBIZ_KYC_TEST_DISPOSABLE=1 VOBIZ_KYC_TEST_SUBACCOUNT=SA_THROWAWAY npm run test:vobiz-kyc
```

This writes provider KYC rows. Verify initial blocked, mock failed/pending/verified PAN, PAN-alone blocked, and final mock Aadhaar verification unlocking the provider gate. Keep this account out of production. Hosted KYC uses the real session API; no hosted mock URL is invented.

### Two-tenant live inbound checklist

1. Create users A/B; confirm separate onboarding, purpose, profile, language, knowledge, active instructions, runtime mode and Gemini credentials. Make A personal and B business. Confirm completion/reload resumes and existing accounts keep their dashboard.
2. Open browser voice for each; inspect tenant system instructions and tools, save different messages/appointments, verify other tenant cannot retrieve them. Test Gemini error, disconnect, mode expiration and key rotation.
3. Create customer-use individual SA accounts from Phone without entering provider credentials. Observe blocked initial state. Start hosted KYC, cancel/restart, allow expiration, complete PAN + DigiLocker, and confirm provider `kyc_calls_blocked=false`; redirect query tampering cannot unlock it.
4. Verify real callback headers at the canonical HTTPS URLs. Missing/forged signature must fail safely. V2/V3 parent and SA signatures must verify. Confirm callback credential configuration with Vobiz; only then set readiness flag `1`.
5. Grant distinct audited beta credits. Browse real inventory, race a number selection, double-click activation and simulate response loss/configuration failure. Confirm one DID, held balance until verified routing, one initial rental debit and successful retry. Verify another tenant cannot inspect/retry/release the DID or read usage/wallet.
6. Call A/B DIDs from another phone. Confirm automatic correct tenant routing, assistant voice/language/profile/knowledge/mode/instructions, caller audio reaching Gemini, Gemini audio reaching caller, natural speed/pitch, barge-in/clear and goodbye checkpoint/hangup. No WebSocket URL setup is performed by customers.
7. Exercise messages, callback requests, quote requests, bookings, CRM (including failure), transcripts and metrics. Verify no cross-tenant records. Test caller hangup, Gemini outage, database outage, stream disconnect/handshake timeout and budget expiry. Confirm secure token expiry/replay and unsupported frame/codec rejection.
8. Repeat long calls and rapid redial/concurrent calls. Record cold/warm answer latency, first audio latency, P50/P95 audio/tool/database metrics, and compare legacy Exotel. Verify rounded-minute CDR cost once, pending holds recovered after missing hangup, and low balance preventing further calls.
9. Trigger due rental twice, low balance suspension, audited credit, reconciliation and operator resume. Release a number including lost response; confirm owned inventory absence and no second delete/purchase.
10. Check installed PWA/offline state, real-device keyboard dialogs, mobile safe areas and all desktop destinations. Authenticated APIs and voice data must never enter shared service-worker caches.

## Beta operator checklist

- Shared signing/encryption secrets match; Node 22 services and all migrations deployed.
- Parent Vobiz API credentials/commercial account ready and provider balance funded.
- Canonical HTTPS callbacks and always-on TLS WebSocket bridge reachable.
- Real callback signatures, hosted KYC, inventory, number binding and two-tenant inbound audio verified.
- Commercial paise prices, rental cadence, support channel and beta credit policy agreed.
- Platform admin IDs allowlisted; no customer role grants operator access.
- Five-minute reconciliation plus failure/backlog/provider-balance alerts configured.
- Access logs redact WebSocket token queries; protected APIs/voice are uncached.
- Payments stay disabled until a real gateway/webhook/settlement integration exists.
- Keep legacy Exotel adapter/data until Vobiz production acceptance; outbound and recording storage are deferred.

## Implementation validation record — 2026-10-10

- Production webpack build and ESLint passed. All migrations 001–010 are applied; original migrations 001–008 remain unchanged.
- `npm test`: eight unit tests passed, including legacy Exotel transport compatibility.
- `npm run test:integration`: the isolated real-database scenario passed, covering two tenants, Better Auth, KYC gates, encrypted credentials, provision/release recovery, signed routing, replay rejection, immutable/idempotent charges, rentals, low-balance suspension, operator credit and resume. Vobiz network responses are fixtures.
- `npm run test:ui`: three Playwright tests passed against the production build. Phone, Assistant, Settings and Calls passed overflow checks at all ten specified viewports. Phone screenshots were visually reviewed across all ten widths; mobile onboarding, settings, calls and activation-sheet screenshots were also reviewed. The activation button fits the 320×568 viewport, and Escape restores focus to the number selector.
- Test fixtures did not enter the public tenant tables, and all temporary test schemas were removed after the runners finished. Screenshots and local logs are in ignored `.test-output/`.
- Real Vobiz hosted/test-mode KYC, funded inventory purchase, callback signature emission and two-tenant carrier/Gemini audio acceptance were not run: parent Vobiz credentials were unavailable. The callback readiness gate remains disabled by default. Real-device keyboard/PWA and measured live latency checks remain on the release checklist above.

## Live-provider sign-off phase

Use [LIVE VOBIZ sign-off](./live-vobiz-signoff.md) for the current 17-contract audit, read-only live evidence, A–S checklist and exact first-call/rollback procedures. The earlier implementation validation record is historical: parent credentials are now present, but hosted KYC, paid provisioning, callback emission and carrier audio still have not been executed. Every provider mutation requires explicit operator action in this phase, including mock KYC (which writes real provider rows).

## Alpha acceptance

Run `npm test`, `npm run test:integration`, `npm run test:ui` and `npm run test:smoke`. Integration/UI use isolated schemas; no provider/Google calls are made. Fixture successful audio does not establish an actual Google/carrier reply.

Validate expired/revoked/used/wrong-email invite denial, racing last use, failed signup rollback, exactly one promo entry, managed/BYOK missing-key fail-closed behavior, plan inactivity/suspension, zero quota, concurrency race, one-use replay, shortened duration and rolling revocation. Check customer rounded-minute debit versus distinct authoritative provider cost, duplicate CDR, setup/call holds, unknown purchase and release recovery. Alpha integration emits a small admission race and five-request authorization burst; this is correctness evidence, not a production capacity benchmark.

Inspect onboarding, Home, Assistant, Phone, Billing/usage and Calls at 360/390/414px and the ten existing viewport checks. Complete the human [alpha runbook](./alpha-operations.md) on staging with an explicitly approved Google key. Carrier/KYC/provisioning acceptance remains the separate [live Vobiz checklist](./live-vobiz-signoff.md).
