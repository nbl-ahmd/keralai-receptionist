# Environment variables

The system runs as **two services**:

1. **Next.js app** (dashboard + API) — deployed to Vercel. Template:
   `.env.local.example`.
2. **Bridge** (WebSocket transport for managed Vobiz, browser voice and deprecated Exotel) —
   deployed to Render. Template: `bridge/.env.example`.

Two values are **shared** between the services and must be byte-for-byte
identical, or browser voice (`BRIDGE_AUTH_SECRET`) or credential decryption
(`TENANT_SECRETS_ENCRYPTION_KEY`) fails. A `TENANT_SECRETS_ENCRYPTION_KEY`
mismatch is the usual reason an Exotel call drops the moment it connects: the
bridge starts, logs `startup db-check: … undecryptable=[…]`, and closes the call
with a "Gemini credential unavailable" error. Fix it by copying the exact Vercel
value to Render (never regenerate), then re-save affected credentials. See
[deployment troubleshooting](./deployment.md#troubleshooting-calls-connect-then-drop-immediately).

## Which files to use

There are exactly two service configurations. Paths below are relative to `keralai-receptionist/`, the Next.js app root (not its `app/` source directory).

| Service | Local secrets file | Committed template | Hosted configuration |
| --- | --- | --- | --- |
| Next.js dashboard + API | `.env.local` | `.env.local.example` | Vercel project → Environment Variables |
| Standalone voice bridge | `bridge/.env.local` | `bridge/.env.example` | Render service → Environment |

Do not create an `app/.env`, a third workspace-root file, or copy app secrets to the bridge. Example files are instructions, not runtime configuration. Next.js loads its app-root `.env.local`; the bridge explicitly loads `bridge/.env.local` independently of the shell working directory, with `bridge/.env` only as a legacy local fallback. Hosted process variables win, and the production bridge skips local env files entirely.

For local use, keep the dashboard at `http://localhost:3000` and bridge at `http://localhost:3001`. Set app `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` to the dashboard origin and `NEXT_PUBLIC_BRIDGE_WS_URL=ws://localhost:3001`; bridge `PUBLIC_APP_ORIGIN=http://localhost:3000` and `PORT=3001`.

`bridge/env.mjs` is a new startup helper, not another environment file. Next.js already loads `.env.local`; the bridge needs explicit loading because plain `dotenv/config` reads `.env` from the shell working directory. This helper keeps `npm run dev:bridge` working from the app root and also supports starting from `bridge/`.

The prepared local files keep the existing database, Vobiz credentials, bridge signing secret and encryption key. The example Better Auth secret was replaced with a random local secret (existing sessions must sign in again); local cron and metrics secrets were generated as well. Both phone-readiness flags remain `0`. Do not copy these local URLs to hosting.

Before local provider testing, fill the marked app blanks: `TELEPHONY_PUBLIC_ORIGIN` (HTTPS tunnel to port 3000), `BRIDGE_PUBLIC_URL` (HTTPS/WSS-capable tunnel to port 3001), the three approved customer prices and provider exposure rate in positive integer INR paise, and `PLATFORM_ADMIN_USER_IDS` (your registered Better Auth user ID, not email). A localhost URL cannot receive external Vobiz callbacks. Phone activation still requires the signature proof and explicit operator actions in [live sign-off](./live-vobiz-signoff.md); filling these values does not authorize provider mutations. Use the selected Gemini credential mode: personal keys in Advanced, or an explicitly configured platform key for invited alpha testers.

Start two terminals in `keralai-receptionist/`: `npm run dev` and `npm run dev:bridge`. Open `http://localhost:3000`. For bridge metrics, supply the generated `METRICS_TOKEN` using the `X-Metrics-Token` header; keep it out of URLs and logs.

For hosting, Vercel uses the real HTTPS app URL for auth and `TELEPHONY_PUBLIC_ORIGIN`, the Render HTTPS URL for `BRIDGE_PUBLIC_URL`, and its WSS URL for `NEXT_PUBLIC_BRIDGE_WS_URL`. Render uses the Vercel HTTPS URL for `PUBLIC_APP_ORIGIN`; Render injects `PORT`. Configure `DATABASE_URL`, `BRIDGE_AUTH_SECRET`, `TENANT_SECRETS_ENCRYPTION_KEY` and the disabled readiness gate on both services. Only Vercel needs Better Auth secrets, Vobiz parent credentials, prices, operator IDs and cron secret. Restart local processes after changes; redeploy Vercel after changing `NEXT_PUBLIC_*` build-time values. See the service-specific tables below for optional settings.

## Shared secrets (set in both services)

| Variable | Required | Description |
| --- | --- | --- |
| `BRIDGE_AUTH_SECRET` | Yes | Signs/verifies the short-lived browser-voice bridge token (HMAC-SHA256). Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `TENANT_SECRETS_ENCRYPTION_KEY` | Yes | AES-256-GCM key that encrypts tenant provider credentials at rest. Generate the same way. **Changing it makes existing ciphertext undecryptable** — tenants must re-save their credentials. |
| `DATABASE_URL` | Yes | Neon Postgres connection string. Use the **pooled** endpoint for the bridge and the app. |

## Next.js app variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Neon connection string. |
| `BETTER_AUTH_SECRET` | Yes | Better Auth session signing secret. 32 random bytes, base64. |
| `BETTER_AUTH_URL` | Prod | Public origin of the app, e.g. `https://keralai-receptionist.vercel.app`. Also used as a trusted auth origin. |
| `PUBLIC_APP_ORIGIN` | Optional | Extra trusted auth origins and, on the bridge, the allowed browser-origin list. Comma-separated. |
| `NEXT_PUBLIC_APP_URL` | Optional | Client auth base URL and trusted origin. |
| `NEXT_PUBLIC_BRIDGE_WS_URL` | Prod | Public WebSocket origin of the bridge, e.g. `wss://keralai-bridge.onrender.com`. Required when the dashboard and bridge are on different hosts. `PUBLIC_BRIDGE_WS_URL` is accepted as a server-side alias. |
| `LEGACY_TENANT_CLAIM_EMAIL` | Optional | Email allowed to claim the migrated legacy workspace. Unset disables claiming. |
| `LEGACY_TENANT_CLAIM_TOKEN` | Claim | Server-only secret the owner enters in Settings → Providers → Legacy data. Required whenever `LEGACY_TENANT_CLAIM_EMAIL` is set. Compared in constant time. |
| `LEGACY_TENANT_CLAIM_REQUIRE_VERIFIED_EMAIL` | Optional | Set to `1` to refuse claiming from accounts whose email is not verified (V1 does not require verification). |
| `NEXT_PUBLIC_SITE_URL` | Optional | Canonical site URL for metadata, sitemap, and robots. |
| `GENAI_MODEL` | Optional | Default text model fallback (`gemini-flash-lite-latest`). |
| `GEMINI_MODEL` | Optional | Default Gemini Live model fallback (`gemini-3.8-live`). |
| `GEMINI_EMBEDDING_MODEL` | Optional | Default embedding model fallback (`gemini-embedding-2`). |
| `BOOKING_OPEN_TIME`, `BOOKING_CLOSE_TIME`, `BOOKING_SLOT_MINUTES`, `BOOKING_OPEN_DAYS`, `BOOKING_HORIZON_DAYS` | Optional | Booking-rule fallbacks. |
| `ASSISTANT_VOICE`, `ASSISTANT_PITCH`, `ASSISTANT_SPEED`, `ASSISTANT_GREETING` | Optional | Voice/greeting fallbacks when a tenant has no saved value. The legacy `MAYA_*` names still work. |
| `EXOTEL_SAMPLE_RATE` | Optional | Fallback sample rate (`8000`). |
| `PORT` | Optional | Dev server port (default `3000`). |

> Default personal-key mode stores encrypted keys per workspace in Advanced.
> Closed-alpha platform mode instead uses server-only `PLATFORM_GEMINI_API_KEY`
> on both services after invitation and tenant authorization. See [alpha setup](./closed-alpha.md).

> There are **no** Exotel account credentials in the environment. Each tenant
> stores its own Account SID, API key, API token and region in
> Dashboard → Settings → Providers → Exotel account, encrypted per workspace.
> `EXOTEL_SAMPLE_RATE` is only a fallback sample rate and is not an account
> credential.

## Bridge variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Pooled Neon connection string. |
| `BRIDGE_AUTH_SECRET` | Yes | Shared with the app (see above). |
| `TENANT_SECRETS_ENCRYPTION_KEY` | Yes | Shared with the app (see above). |
| `LEGACY_GEMINI_API_KEY` | Optional | One-time import of the pre-multitenancy Gemini key into the legacy tenant (encrypted at rest) so a single-tenant deployment keeps working after upgrading. Ordinary tenant traffic never reads this variable. |
| `PUBLIC_APP_ORIGIN` | Optional | Comma-separated allow-list of dashboard origins for `/ws/browser`. If unset, any origin is accepted; a mismatch returns `403`. |
| `BROWSER_MAX_SESSIONS_PER_IP` | Optional | Concurrent browser sessions per IP (default `3`). |
| `BROWSER_SESSION_TTL_MS` | Optional | Max browser session lifetime (default `900000`, 15 min). |
| `EXOTEL_SAMPLE_RATE` | Optional | Fallback sample rate (`8000`). |
| `PROFILE_CACHE_TTL_MS` | Optional | Per-tenant profile cache TTL (default 5 min). |
| `PG_POOL_MAX` | Optional | Postgres pool size (default `10`). |
| `PG_QUERY_TIMEOUT_MS` | Optional | Per-query timeout (default `15000`). |
| `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` | Optional | Model-name fallbacks. |
| `EMBED_TIMEOUT_MS` | Optional | Embedding request timeout (default `8000`). |
| `CRM_TIMEOUT_MS` | Optional | CRM webhook timeout (default `8000`). |
| `BARGE_IN_MUTE_MS` | Optional | Barge-in mute watchdog (default `2000`). |
| `END_CALL_GRACE_MS` | Optional | Delay before the bridge hangs up after the assistant ends the call (default `900`). |
| `GEMINI_TRANSCRIPTION_LANGUAGES` | Optional | Comma-separated input-transcription language codes (default `ml-IN,en-IN`). |
| `GEMINI_TRANSCRIPTION_CUSTOM_VOCABULARY` | Optional | Extra words to improve recognition; tenant profile names are merged in automatically. |
| `GEMINI_TRANSCRIPTION_MODE` | Optional | `VERBATIM` (default) or `SMART`. |
| `GEMINI_END_SILENCE_MS` | Optional | End-of-speech silence for VAD (default `350`; lower = faster turn-taking). |
| `GEMINI_PREFIX_PADDING_MS` | Optional | VAD prefix padding in ms (default `200`). |
| `LATENCY_LOG`, `LATENCY_LOG_INTERVAL_MS`, `VERBOSE_AUDIO_LOG`, `SLOW_DB_MS` | Optional | Observability controls. |
| `METRICS_ENABLED`, `METRICS_TOKEN` | Optional | `GET /metrics` controls. In production metrics are disabled unless `METRICS_TOKEN` is set. |
| `EXPOSE_SECRETS_FINGERPRINT` | Optional | Set to `1` to include `secretsKeyFingerprint` in `/health` while debugging key alignment. Off by default in production. |
| `DEBUG_TIMING` | Optional | Legacy per-phase timing logs. |
| `PORT` | Optional | Local dev port only; Render injects it. |

## Generating secrets locally

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it once each for `BETTER_AUTH_SECRET`, `BRIDGE_AUTH_SECRET`, and
`TENANT_SECRETS_ENCRYPTION_KEY`. Put the same `BRIDGE_AUTH_SECRET` and
`TENANT_SECRETS_ENCRYPTION_KEY` in both `.env.local` and `bridge/.env.local`.

## Local files

- `.env.local` — Next.js app. Gitignored.
- `bridge/.env.local` — bridge. Gitignored.

`bridge/.env.local` values must be consistent with `.env.local` for the shared
secrets and `DATABASE_URL`.

## Secret-handling rules

- Never log decrypted secrets, full API keys, Exotel tokens, bridge tokens, auth
  session tokens, or encryption keys.
- Settings APIs return only `configured`, `provider`, `keyName`, `maskedSuffix`,
  and timestamps.
- Exotel tokens and bridge tokens are shown in plaintext exactly once (at
  creation/rotation); only hashes/signatures are persisted.
## Managed telephony (Next.js only)

App template: `.env.local.example`. Bridge template: `bridge/.env.example`. All Vobiz/price/admin values are server-only. Never prefix credentials with `NEXT_PUBLIC_`. The bridge has no need for parent Vobiz credentials.

| Variable | Required for phones | Purpose |
| --- | --- | --- |
| `TELEPHONY_PROVIDER` | Optional | `vobiz` by default; unsupported adapters fail closed. |
| `VOBIZ_AUTH_ID`, `VOBIZ_AUTH_TOKEN` | Yes | Platform parent credentials for customer management, KYC, inventory and parent signatures. |
| `TELEPHONY_PUBLIC_ORIGIN` | Yes | Canonical HTTPS app origin, no path/query/userinfo. Used for hosted KYC URLs and voice signature URL verification. Must match the actual provider callback origin. |
| `BRIDGE_PUBLIC_URL` | Yes | Public HTTPS/WSS bridge origin used to issue `/ws/vobiz` call URLs. Separate from the existing browser `NEXT_PUBLIC_BRIDGE_WS_URL`. |
| `VOBIZ_CALLBACK_SIGNATURES_VERIFIED` | Yes | Set `1` only after verifying real V2/V3 signed callbacks on this account/application configuration; default `0` disables activation. |
| `PHONE_MONTHLY_PRICE_MINOR` | Yes | Customer 30-day number rental in integer INR paise; explicit commercial decision. |
| `PHONE_SETUP_PRICE_MINOR` | Yes | Customer initial setup fee in integer paise. Positive values required in this beta. |
| `CALL_PRICE_PER_MINUTE_MINOR` | Yes | Customer rounded-minute rate in integer paise, snapshotted per call. |
| `PLATFORM_ADMIN_USER_IDS` | Admin | Comma-separated trusted Better Auth user IDs. Empty means no administrator access. Membership owner/admin does not grant platform admin. |
| `CRON_SECRET` | Yes | Strong secret for `Authorization: Bearer ...` on `/api/jobs/telephony`. |

Keep parent provider balance funded independently of customer KeralAI balances. Define prices/terms before inviting users. Existing model/booking/voice/CRM environment settings continue to work.

## Test-only variables

`TEST_DATABASE_URL` optionally chooses the Neon test database; otherwise test runners create a disposable schema in the configured database. Schema migrations and pg fixtures use its direct endpoint; Neon HTTP queries set search path transaction-locally. `KERALAI_TEST_SCHEMA` is generated by the runner and must NEVER be set on a deployed service. `TEST_SCHEMA` is an assertion value for the tests. Test schemas have no customer fixtures and are dropped in `finally`.

For live provider test mode only: `VOBIZ_KYC_TEST_SUBACCOUNT` is a newly created throwaway customer-use individual SA account and `VOBIZ_KYC_TEST_DISPOSABLE=1` attests it is safe to write mock verification records. No hosted-session test endpoint is assumed.

Live sign-off now requires `VOBIZ_CALLBACK_SIGNATURES_VERIFIED` on both the Next.js app and the bridge. Default/unset/0 rejects phone activation and media authorization; only explicit operator value 1 after actual callback signature validation enables them. No parent API credential belongs on the bridge. See [live sign-off](./live-vobiz-signoff.md) for the current environment findings and approval boundaries.

## Phone page reports an unreadable AI key

A saved Gemini key can fail AES-GCM authentication if it was encrypted with a different master key or its stored encrypted data is damaged. This previously caused `GET /api/telephony/account` to return 500. The summary now reports `assistantConfigured:false` and `assistantNeedsRepair:true`, and the Phone page links to AI setup. Calls still require a usable key; database failures are still reported as errors rather than disguised as missing credentials.

Restore the original `TENANT_SECRETS_ENCRYPTION_KEY` on both services if available. Otherwise, re-save the affected workspace's Gemini key at `/dashboard/advanced` using the current matching keys. Do not regenerate the encryption key: that would also break other saved credentials. Restart both local services after editing configuration. Replacing `BETTER_AUTH_SECRET` also requires signing in again.

Auth and management database pools now handle idle-client error events using sanitized event logs instead of allowing an unhandled exception to print the complete client object. This handles an idle disconnect; it does not guarantee active queries will succeed during a database outage.

## Closed alpha

Credential mode is per-tenant DB state, not a global env toggle. Invitations are hashed DB links, not a shared code/email allowlist. Existing tenants retain BYOK/Internal; new invitations provision managed AI/Alpha. Old ALPHA_MODE, GEMINI_CREDENTIAL_MODE, ALPHA_TESTER_EMAILS and ALPHA_INVITE_CODE are retired.

| Variable | Service | Purpose |
| --- | --- | --- |
| `AI_ENVIRONMENT` | Both | development / alpha / production; use separate Google projects/keys. Production rejects test-schema settings. |
| `PLATFORM_GEMINI_API_KEY` | Both | Server-only managed credential; missing key fails closed. Never NEXT_PUBLIC or a copied customer key. |
| `ALPHA_AI_DAILY_REQUEST_LIMIT` | Both | Managed tenant client/session starts per UTC day; default 20; not token/currency billing. |
| `AI_VOICE_ESTIMATE_MINOR_PER_MINUTE` | Both | Positive conservative paise estimate; prepared default 100 is a risk allowance, not a Google quote. |
| `PROVIDER_VOICE_RESERVE_MINOR_PER_MINUTE` | Both | Approved positive paise exposure rate required before phone admission; intentionally blank. |
| `PRICING_VERSION` | Both | Snapshot label, default alpha-v1. |
| `PLATFORM_BROWSER_VOICE_ENABLED` | Both | 0 disables browser voice independently of DB plan/gate. Prepared default 1. |
| `PLATFORM_NEW_PHONE_CALLS_ENABLED` | Both | Independent phone kill switch; prepared 0. DB phone control and Vobiz attestation also required. |
| `PLATFORM_NUMBER_PURCHASE_ENABLED` | Both | Independent purchase kill switch; prepared 0. DB/tenant purchase/plan and attestation also required. |
| `ALPHA_INVITE_ISSUANCE_ENABLED` | App | Prepared 0; explicitly enable for allowlisted operator issuance. Signup remains invite-gated either way. |
| `SMOKE_APP_ORIGIN`, `SMOKE_BRIDGE_ORIGIN` | App/script | Optional read-only health endpoints for test:smoke. |

Only two local files exist: app `.env.local` and bridge `.env.local`. Preserve existing database/encryption/signing values. Fill actual platform key and operator ID yourself; unknown credentials/commercial prices were not guessed. Restart local services after changing env. Vercel/Render use their own process environment, with matching shared values; no third root file or hosted upload of laptop env files is required. Follow [alpha operations](./alpha-operations.md) for gates, migrations 001–015, invitation launch and rollback.
