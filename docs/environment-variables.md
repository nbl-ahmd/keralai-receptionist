# Environment variables

The system runs as **two services**:

1. **Next.js app** (dashboard + API) — deployed to Vercel. Template:
   `.env.local.example`.
2. **Bridge** (WebSocket transport for Exotel phone calls and browser voice) —
   deployed to Render. Template: `bridge/.env.example`.

Two values are **shared** between the services and must be byte-for-byte
identical, or browser voice (`BRIDGE_AUTH_SECRET`) or credential decryption
(`TENANT_SECRETS_ENCRYPTION_KEY`) fails.

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
| `NEXT_PUBLIC_SITE_URL` | Optional | Canonical site URL for metadata, sitemap, and robots. |
| `GENAI_MODEL` | Optional | Default text model fallback (`gemini-flash-lite-latest`). |
| `GEMINI_MODEL` | Optional | Default Gemini Live model fallback (`gemini-3.8-live`). |
| `GEMINI_EMBEDDING_MODEL` | Optional | Default embedding model fallback (`gemini-embedding-2`). |
| `BOOKING_OPEN_TIME`, `BOOKING_CLOSE_TIME`, `BOOKING_SLOT_MINUTES`, `BOOKING_OPEN_DAYS`, `BOOKING_HORIZON_DAYS` | Optional | Booking-rule fallbacks. |
| `MAYA_VOICE`, `MAYA_PITCH`, `MAYA_SPEED`, `MAYA_GREETING` | Optional | Voice fallbacks when a tenant has no saved value. |
| `EXOTEL_SAMPLE_RATE` | Optional | Fallback sample rate (`8000`). |
| `PORT` | Optional | Dev server port (default `3000`). |

> There is **no** `GEMINI_API_KEY` for tenant traffic. Each tenant stores its own
> encrypted key in Dashboard → Settings → Providers.

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
| `LATENCY_LOG`, `LATENCY_LOG_INTERVAL_MS`, `VERBOSE_AUDIO_LOG`, `SLOW_DB_MS` | Optional | Observability controls. |
| `METRICS_ENABLED`, `METRICS_TOKEN` | Optional | `GET /metrics` controls. |
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