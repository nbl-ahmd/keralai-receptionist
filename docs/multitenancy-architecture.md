# Multitenancy architecture

This document explains how the KeralAI Receptionist developer preview isolates
each authenticated user into their own tenant, how data is scoped, how tenant
provider credentials are stored, and how existing single-tenant data was
preserved.

## Goals

- Every authenticated user gets an isolated workspace (a **tenant**) with role
  `owner`.
- Every tenant-owned row is reachable only through a trusted, server-resolved
  tenant context.
- No client-provided tenant ID is ever trusted on its own.
- Existing single-tenant data is preserved, not deleted, and can be claimed.
- The design supports multiple users sharing one tenant later.

## Identity model

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth core tables (camelCase quoted columns). |
| `tenants` | One row per workspace. `slug` is globally unique. `is_legacy` marks the migrated workspace. |
| `tenant_memberships` | Joins a Better Auth `user.id` to a `tenant_id` with a `role` (`owner`/`admin`/`member`). Unique on `(tenant_id, user_id)`. |
| `legacy_tenant_claims` | One-time ledger recording who claimed the legacy tenant and when. |

A `tenant_memberships` row is the only source of tenant access. A user may hold
memberships in many tenants; V1 provisions exactly one on signup.

### Provisioning

`lib/tenant/provision.ts` runs from a Better Auth `databaseHooks.user.create`
hook. It creates a tenant (name derived from the user, unique slug) and an
`owner` membership. Provisioning failures never block signup — the next
authenticated request self-heals through `ensureTenantAccess()`.

### Tenant resolution

`lib/auth/context.ts` (`getTenantContext`) is the single authority for tenant
context. For each request it:

1. Reads the Better Auth session.
2. Validates the user actually holds a membership for the requested tenant.
3. `pickMembership` chooses deterministically:
   - an explicit `x-tenant-id` header **only if** the user holds that membership;
   - otherwise the claimed legacy membership (so a claiming owner lands in the
     migrated workspace);
   - otherwise the highest role, then the oldest membership.

If no valid membership exists, it falls back to `ensureTenantAccess()`, which
provisions (or repairs) a personal tenant. Unauthenticated requests receive
`401`; authenticated-but-unauthorized receive `403`; routes use `404` where
appropriate to avoid object enumeration.

## Tenant-owned tables

Migration `007_tenant_scope.sql` adds a **NOT NULL** `tenant_id` (FK to
`tenants`) to every tenant-owned table and backfills existing rows into the
legacy tenant. Child tables that reference a parent carry their own `tenant_id`
so no join is required to scope them.

- `company_profile` — unique per `(tenant_id)`
- `knowledge_items`
- `knowledge_embeddings` — vector search always filters by `tenant_id`
- `calls` — unique on `(tenant_id, call_sid)`
- `call_transcript_turns`
- `call_knowledge_queries`
- `call_metrics` — `call_id` primary key, insert uses `on conflict (call_id)`
- `call_log`
- `contacts`
- `appointments`
- `messages`
- `callback_requests`
- `quote_requests`
- `crm_sync_events`
- `tenant_settings` — non-secret per-tenant configuration
- `tenant_secrets` — encrypted credentials
- `tenant_bridge_credentials` — Exotel token hash
- `tenant_runtime_state` — one row per tenant

Global uniqueness that used to be process-wide is replaced with tenant-aware
key-based uniqueness. Provider IDs remain globally unique only where the
provider guarantees it.

## Store layer

`lib/store.ts` takes `tenantId` as an explicit first argument on every function
that touches tenant-owned data, e.g. `getCalls(tenantId, options)`. There is no
hidden mutable global tenant context. `bridge/db.mjs` mirrors this: every
function takes a `tenantId` and every query filters by it.

## Tenant secrets

Provider credentials live in `tenant_secrets` and are encrypted with
**AES-256-GCM** using `TENANT_SECRETS_ENCRYPTION_KEY` (32 random bytes,
base64). Each row stores `ciphertext`, `iv`, `auth_tag`, and a `key_version`.
`masked_suffix` is kept only for display.

- `lib/tenant/secrets.ts` (Next.js) and `bridge/secrets.mjs` (bridge) implement
  the same format.
- Secrets are **never** returned to the browser. Settings APIs return only
  `configured`, `provider`, `keyName`, `maskedSuffix`, and timestamps.
- Secrets are **never** logged. Error paths redact key material.

Supported provider surface is intentionally extensible (`provider` + `key_name`),
so future provider types need no schema change.

## Per-tenant Gemini

There is **no global Gemini API key** for tenant traffic.

- `lib/gemini.ts` resolves the tenant's Gemini key, decrypts it, and builds a
  tenant-scoped `GoogleGenAI` client, cached with a TTL.
- `bridge/gemini.mjs` does the same for the bridge with its own TTL cache.
- Model names default to the platform values (`GENAI_MODEL`, `GEMINI_MODEL`,
  `GEMINI_EMBEDDING_MODEL`) only when the tenant has not chosen one in
  `tenant_settings`.
- Knowledge embeddings use the tenant credential, and embedding search is always
  constrained by `tenant_id`.

## Assistant runtime modes

`tenant_runtime_state` stores one row per tenant: the selected mode, optional
custom label/instruction, an optional `expires_at`, and who updated it. Built-in
mode definitions (Available, Sleeping, Meeting, Driving, Focus, Do not disturb,
Lunch, Travelling, After hours, Custom) live in `lib/tenant/modes.ts` and
`bridge/shared/runtime-modes.mjs`.

- `getEffectiveRuntimeState` falls back to `available` when `expires_at` has
  passed, so an expired mode never applies.
- At call/session start the bridge composes the runtime block and combines it
  with the tenant's active instructions in `buildSystemInstruction(...)`.
- Runtime modes are **not** stored as vector knowledge and never appear in
  knowledge search results.

## Active instructions

The pre-existing `knowledge_items` rows of `type = 'instruction'` are preserved
and tenant-scoped. They are never embedded, and normal knowledge search excludes
them. Active instructions are loaded per call and combined with the runtime mode
at session initialization.

## Bridge routing

The bridge is tenant-aware on both transports.

### Exotel

- URL shape: `/ws/exotel/:tenantSlug?token=...`
- The bare path `/ws/exotel` is rejected — there is no default tenant.
- Only a SHA-256 **hash** of the token is stored, in
  `tenant_bridge_credentials`. The bridge verifies with
  `crypto.timingSafeEqual`.
- Unknown slug and bad token both return HTTP `404` to avoid enumeration.
- The dashboard exposes the exact URL and a rotate action in Settings →
  Providers. Tokens are shown in plaintext exactly once, at rotation.

### Browser voice

- The dashboard requests a short-lived signed token from `/api/voice/token`.
- Tokens are stateless HMAC-SHA256 signed with `BRIDGE_AUTH_SECRET`, carrying
  `sub` (user id), `tid` (tenant id), `scope: "browser"`, `exp`, and a random
  `jti` nonce.
- The bridge verifies signature and expiry, and takes the tenant **only** from
  `tid`. A `?tenantId=` query parameter is never trusted.
- Failed verification returns HTTP `401` on the upgrade.

The bridge resolves the tenant before any database access and builds the Gemini
client from that tenant's decrypted credential. If the tenant has no Gemini
credential configured, the call is closed with WebSocket `1011` and a clear
message.

## Legacy data migration strategy

The existing deployment used a singleton `company_profile` and globally scoped
tables. Instead of deleting or duplicating that data:

1. Migration `006` creates the tenant model and the Better Auth core tables.
2. Migration `007` adds `tenant_id` everywhere and backfills **all** existing
   rows into a single generated **legacy tenant** (`is_legacy = true`).
3. The first authenticated owner whose email matches `LEGACY_TENANT_CLAIM_EMAIL`
   may claim the legacy tenant through `POST /api/tenant/claim-legacy`. A
   one-time row in `legacy_tenant_claims` prevents a second claim.
4. After claiming, `pickMembership` prefers the legacy membership so the owner
   lands in the migrated workspace.

If no claim happens, the legacy workspace remains inaccessible to unrelated
users because access requires a membership row. Nothing is silently deleted.

## CRM

CRM configuration is per tenant. The provider (`none` or `webhook`) and webhook
URL live in `tenant_settings`; the optional signing secret lives encrypted in
`tenant_secrets` (`provider = 'crm'`). There is no process-wide CRM default.

When a webhook is configured, outgoing syncs carry the tenant's secret in the
`X-KeralAI-Signature` header. Treat this as a shared secret for the receiver to
compare against. Syncing is best-effort: a failure is recorded in
`crm_sync_events` and never breaks a live call or a booking.

## PWA and caching

The service worker (`public/sw.js`) caches **only** same-origin immutable build
assets (`/_next/static/`) and icons. It never caches `/api/*`, WebSocket traffic,
or HTML, so one tenant's authenticated data can never be served to another or
survive a logout.

## Key files

| Concern | Files |
| --- | --- |
| Auth | `lib/auth/server.ts`, `lib/auth/client.ts`, `lib/auth/context.ts`, `middleware.ts`, `app/api/auth/[...all]/route.ts` |
| Tenant primitives | `lib/tenant/types.ts`, `provision.ts`, `secrets.ts`, `settings.ts`, `modes.ts`, `bridge-token.ts`, `bridge-url.ts` |
| Gemini | `lib/gemini.ts`, `bridge/gemini.mjs` |
| Store | `lib/store.ts`, `bridge/db.mjs` |
| Bridge | `bridge/server.mjs`, `bridge/browser-session.mjs`, `bridge/bridge-token.mjs`, `bridge/secrets.mjs`, `bridge/crm.mjs` |
| Migrations | `db/migrations/006_multitenancy_foundation.sql`, `db/migrations/007_tenant_scope.sql` |
| APIs | `app/api/tenant/*`, `app/api/modes/*`, `app/api/voice/token/*` |

See also: [`environment-variables.md`](./environment-variables.md),
[`deployment.md`](./deployment.md), and [`manual-testing.md`](./manual-testing.md).