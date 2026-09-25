-- KeralAI Receptionist — multitenancy foundation
--
-- Introduces tenants, memberships, tenant secrets, per-tenant bridge
-- credentials, per-tenant runtime state, tenant settings, and the Better Auth
-- core tables (user/session/account/verification).
--
-- A "legacy" tenant is created to own all pre-multitenancy data. Migration 007
-- backfills every existing row into it. The legacy tenant can be claimed once
-- by a trusted owner (see LEGACY_TENANT_CLAIM_EMAIL / claim_legacy_tenant).
--
-- Apply with:
--   npm run migrate
--
-- Idempotent: safe to re-run.

-- ─── Tenants ────────────────────────────────────────────────────────────────
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My workspace',
  slug text not null unique,
  is_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one legacy tenant.
create unique index if not exists tenants_single_legacy_idx
  on tenants ((is_legacy)) where is_legacy = true;

-- ─── Memberships (many users per tenant) ────────────────────────────────────
create table if not exists tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id text not null,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_role_check check (role in ('owner', 'admin', 'member')),
  constraint tenant_memberships_tenant_user_key unique (tenant_id, user_id)
);
create index if not exists tenant_memberships_user_idx on tenant_memberships (user_id);

-- One-time legacy claim ledger. A tenant can be claimed once.
create table if not exists legacy_tenant_claims (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  user_id text not null,
  claimed_at timestamptz not null default now()
);

-- ─── Tenant secrets (AES-256-GCM ciphertext only) ───────────────────────────
-- Values are base64-encoded. The plaintext never touches Postgres.
create table if not exists tenant_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  key_name text not null,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1,
  masked_suffix text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_secrets_tenant_provider_key unique (tenant_id, provider, key_name)
);
create index if not exists tenant_secrets_tenant_idx on tenant_secrets (tenant_id, provider);

-- ─── Tenant bridge credentials (Exotel) ─────────────────────────────────────
-- Only a SHA-256 hash of the per-tenant Exotel token is stored.
create table if not exists tenant_bridge_credentials (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  token_hash text not null,
  token_last4 text,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- ─── Per-tenant assistant runtime state ─────────────────────────────────────
-- Exactly one row per tenant. `mode = 'custom'` uses the custom label/instruction.
create table if not exists tenant_runtime_state (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  mode text not null default 'available',
  label text,
  instruction text,
  expires_at timestamptz,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- ─── Per-tenant non-secret settings (jsonb) ─────────────────────────────────
-- e.g. gemini.model, crm.provider, crm.webhook_url.
create table if not exists tenant_settings (
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);

-- ─── Seed the legacy tenant (idempotent) ────────────────────────────────────
insert into tenants (name, slug, is_legacy)
values ('Legacy installation', 'legacy', true)
on conflict (slug) do nothing;

-- ─── Better Auth core tables (generated for better-auth 1.7.6) ──────────────
create table if not exists "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null
);

create table if not exists "session" (
  "id" text not null primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table if not exists "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz not null
);

create table if not exists "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null
);

create index if not exists "session_userId_idx" on "session" ("userId");
create index if not exists "account_userId_idx" on "account" ("userId");
create index if not exists "verification_identifier_idx" on "verification" ("identifier");
