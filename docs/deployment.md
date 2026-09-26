# Deployment

This guide covers local setup and deploying the two services: the Next.js app on
Vercel and the bridge on Render. For the full variable reference see
[`environment-variables.md`](./environment-variables.md).

## 1. Local setup

### Prerequisites

- Node.js 18+
- A Neon Postgres database
- A Google AI Studio (Gemini) API key **per tenant** — created in the dashboard,
  not in env for tenant traffic

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure the app
cp .env.local.example .env.local
#    Fill in DATABASE_URL, BETTER_AUTH_SECRET, BRIDGE_AUTH_SECRET,
#    TENANT_SECRETS_ENCRYPTION_KEY.

# 3. Configure the bridge (must share the two secrets + DATABASE_URL)
cp bridge/.env.example bridge/.env.local

# 4. Install bridge deps
cd bridge && npm install && cd ..

# 5. Apply migrations (creates the tenant model + auth tables, backfills legacy data)
npm run migrate
npm run migrate:status

# 6. Run the app
npm run dev            # http://localhost:3000

# In a second terminal, run the bridge
npm run dev:bridge     # http://localhost:3001
```

### Generating the three secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run it three times: once each for `BETTER_AUTH_SECRET`, `BRIDGE_AUTH_SECRET`,
and `TENANT_SECRETS_ENCRYPTION_KEY`. The latter two must be identical in
`.env.local` and `bridge/.env.local`.

### Local migration notes

- Migrations are filename-ordered (`db/migrations/*.sql`) and run through
  `scripts/migrate.mjs`.
- `006_multitenancy_foundation.sql`, `007_tenant_scope.sql`, and
  `008_assistant_config.sql` are idempotent and transactional; re-running is
  safe.
- Existing single-tenant rows are backfilled into a generated legacy tenant. No
  data is deleted.
- To claim the legacy data, set `LEGACY_TENANT_CLAIM_EMAIL` to the intended owner
  email and `LEGACY_TENANT_CLAIM_TOKEN` to a random server-only secret. After
  signing in with that email, open Settings → Providers → Legacy data, paste the
  token, and claim. Users are never granted the legacy workspace implicitly at
  signup.

## 2. Deploy the Next.js app (Vercel)

1. Import the repository in Vercel.
2. Framework preset: **Next.js**. Build command `npm run build`, output default.
3. Set environment variables (Production, and Preview if desired):
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`
   - `BETTER_AUTH_URL` = your production URL
   - `BRIDGE_AUTH_SECRET`
   - `TENANT_SECRETS_ENCRYPTION_KEY`
   - `NEXT_PUBLIC_BRIDGE_WS_URL` = `wss://<bridge-host>`
   - `PUBLIC_APP_ORIGIN` = your production URL (and preview URLs, comma-separated)
   - `LEGACY_TENANT_CLAIM_EMAIL` (optional)
   - `LEGACY_TENANT_CLAIM_TOKEN` (required to enable legacy claiming)
4. Deploy.
5. Run migrations against the production `DATABASE_URL` **before** or right after
   the first deploy:
   ```bash
   DATABASE_URL="<prod pooled url>" npm run migrate
   ```
   (Run from a trusted environment; never expose the connection string.)

The build externalizes `pg` and `better-auth` via
`experimental.serverComponentsExternalPackages`, and the auth instance is created
lazily so the build does not require `DATABASE_URL`.

## 3. Deploy the bridge (Render)

`render.yaml` defines a Blueprint service.

1. In Render: **New → Blueprint**, point to the repository.
2. Set the secret env vars in the service's **Environment** tab:
   - `DATABASE_URL` — must be the **pooled** (PgBouncer) connection string
   - `BRIDGE_AUTH_SECRET` — must match the Vercel value
   - `TENANT_SECRETS_ENCRYPTION_KEY` — must match the Vercel value
3. Optionally set:
   - `PUBLIC_APP_ORIGIN` = your dashboard origin(s)
   - `BROWSER_MAX_SESSIONS_PER_IP`, `BROWSER_SESSION_TTL_MS`
   - `METRICS_TOKEN` if `GET /metrics` should be protected
4. Deploy. Health check path is `/ping`.
5. Note the service URL: `https://<service-name>.onrender.com`.
6. Set `NEXT_PUBLIC_BRIDGE_WS_URL=wss://<service-name>.onrender.com` on Vercel
   and redeploy the app.

No Gemini key is set on Render. Each tenant's key is decrypted from the database
per session.

> **Critical:** `TENANT_SECRETS_ENCRYPTION_KEY` must be **byte-for-byte
> identical** on Vercel and Render. The dashboard encrypts tenant credentials;
> the bridge decrypts them. If the two differ, every phone call ends the moment
> it connects ("Tenant Gemini credential unavailable"). The bridge logs a
> `startup db-check` line listing any undecryptable workspaces, e.g.
> `geminiKeys configured=9 undecryptable=[legacy, muhammed-ajmal] — align
> TENANT_SECRETS_ENCRYPTION_KEY on Vercel and Render`. Fix the Render value to
> match Vercel (do **not** regenerate), then re-save the affected credentials.
>
> To confirm both sides derived the same key before re-saving credentials,
> compare the non-secret `secretsKeyFingerprint` from the dashboard's
> `GET /api/health` with the bridge's `GET /health`, e.g.
> `curl https://keralai-bridge.onrender.com/health`. The two 8-character
> hashes must match; the fingerprint never reveals the key itself.
>
> If `LEGACY_GEMINI_API_KEY` is set on the bridge, the pre-multitenancy Gemini
> key is imported into the legacy tenant exactly once, encrypted at rest, so
> deployments upgrading from the single-tenant version keep working.

## 4. Connect Exotel (per tenant)

Every tenant uses its **own** Exotel account and number. There is no shared
platform account and no Exotel credential in the environment.

1. Have the tester sign in and open **Settings → Providers → Exotel account**.
2. Enter the Account SID, API key, API token and region from their Exotel
   dashboard (**Settings → API Settings**), plus their ExoPhone number.
   Click **Save Exotel account**, then **Test connection** to confirm Exotel
   accepts the credentials and to list the numbers on their account.
3. In the same page under **Exotel routing**, click **Rotate** to generate a
   token. A single URL is shown once. Put it in the Voicebot applet's URL
   field:
   ```
   wss://tenant:<token>@<service-name>.onrender.com/ws/exotel/<tenant-slug>
   ```
   Exotel moves the credentials out of the URL and sends them as an
   `Authorization: Basic` header, which it reliably forwards.
4. Paste the URL into the tester's Exotel Voicebot applet. Calls to *their*
   number now reach *their* workspace.
5. Only a SHA-256 hash of the token is stored. Rotating invalidates the old URL
   immediately — update Exotel at the same time.

> Exotel has been observed stripping or mangling arbitrary query parameters
> (its own docs note `token=abc` sometimes arriving as `token:abc=`). That is
> why the dashboard shows only the Basic-auth URL. The bridge still accepts the
> token from `?token=`, a malformed `?token:<token>=` key, an `Authorization:
> Basic` header, or a trailing `/ws/exotel/<slug>/<token>` path segment, as
> resilience fallbacks — so a call authenticates even if Exotel rewrites the
> URL.

A tester with no Exotel account creates a new one (their own trial number) and
repeats steps 1–4; nothing is shared with other tenants. The bare path
`/ws/exotel` is rejected with `404`. Unknown slug and an invalid token also
return `404` (no enumeration).

### Troubleshooting: calls connect then drop immediately

The bridge logs a precise reason for every upgrade **before** authentication —
never the token itself. Watch the Render logs and match the line:

| Log line | Meaning | Fix |
| --- | --- | --- |
| `[exotel-auth] rejected bare /ws/exotel …` | The Exotel applet still points at the old pre-multitenancy path. | Paste the tenant URL from Settings → Providers → Exotel routing into the applet. |
| `[exotel-auth] upgrade … tokenPresent=no tokenSource=none` then `reason=missing_slug_or_token` | The applet URL carries the slug but no token. | Re-copy the Basic-auth URL from Settings → Providers → Exotel routing; do not hand-type it. `queryParams=0` in the same line usually means Exotel stripped the query string entirely. |
| `[exotel-auth] rejected slug=… reason=unknown_slug` | The slug in the URL is wrong. | Re-copy the URL; do not rename the workspace. |
| `[exotel-auth] rejected … reason=no_credential_configured` | No token has been generated for this workspace. | Click **Rotate** to generate one. |
| `[exotel-auth] rejected … reason=token_mismatch tenant=…` | The token was rotated after it was pasted into Exotel. | Update the applet with the current URL. |
| `[exotel-auth] accepted …` then `No usable Gemini credential for tenant …` | The tenant's encrypted credentials cannot be decrypted. | The dashboard and bridge use different `TENANT_SECRETS_ENCRYPTION_KEY` values. Set Render to the exact Vercel value, redeploy, then re-save the Gemini key / rotate the Exotel token. |
| `startup db-check: … undecryptable=[…]` | Same master-key mismatch, detected at boot. | As above. |

The `[exotel-auth] upgrade` line reports only non-secret facts: the slug, whether
a token is present and its length, which channel supplied it (`tokenSource=`),
how many query parameters arrived (`queryParams=`), and whether an
`Authorization` header was present. It never logs the token itself.

A call dropping immediately after `[exotel-auth] accepted` is almost always the
**undecryptable-credential** case, not the URL: the tenant's Gemini key was
saved by the dashboard with a different encryption key than the bridge holds.

## 5. Browser voice

1. Sign in to the dashboard.
2. Click **Start live session**. The client calls `/api/voice/token`, receives a
   short-lived signed token, and connects to
   `wss://<bridge-host>/ws/browser?token=...`.
3. The bridge verifies the signature/expiry and reads the tenant from the token.
   `?tenantId=` is never trusted.

If browser voice immediately disconnects with `401`, the `BRIDGE_AUTH_SECRET`
values differ between Vercel and Render.

## 6. PWA

- Manifest: `public/manifest.webmanifest` (start URL `/dashboard`).
- Service worker: `public/sw.js`, registered in production only. It caches only
  `/_next/static/` and icons — never HTML, `/api/`, or WebSocket traffic.
- Icons: regenerate with `node scripts/generate-icons.mjs` if branding changes.

## 7. Post-deploy checklist

- [ ] `npm run build` and `npm run lint` pass.
- [ ] `npm run migrate` applied 006–008; `npm run migrate:status` is clean.
- [ ] Health check: `GET /api/health` reports `auth`, `bridgeAuth`, and
      `secretsEncryption` as `configured` (it stays public and coarse).
- [ ] Register user A and user B; confirm each receives a distinct tenant.
- [ ] Save A's Gemini key; confirm B cannot see it.
- [ ] Activate a mode for A; confirm a new A voice session receives it.
- [ ] Exotel A and B URLs each reach their own tenant.
- [ ] Run the [manual test matrix](./manual-testing.md).

## Rollback / recovery notes

- Migrations are additive and idempotent; they do not drop data. Use Neon's
  branch/instant-restore if a rollback is ever required.
- Rotating `TENANT_SECRETS_ENCRYPTION_KEY` invalidates stored ciphertext. Keep
  the key stable across deploys; if it must change, re-save every tenant's
  credentials afterwards.
- Rotating an Exotel token requires updating the Exotel applet.