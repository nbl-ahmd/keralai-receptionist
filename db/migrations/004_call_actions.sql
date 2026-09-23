-- KeralAI Receptionist — call action tables + per-call log
--
-- Adds the tables the Live tools write to, plus a call_log so every call leaves
-- a record. Apply with:
--   npm run migrate
-- or
--   psql "$DATABASE_URL" -f db/migrations/004_call_actions.sql
--
-- Idempotent: safe to re-run.

-- ─── Callback requests ──────────────────────────────────────────────────────
create table if not exists callback_requests (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete set null,
  customer_name text not null,
  phone text,
  preferred_time text,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists callback_requests_status_idx on callback_requests (status, created_at desc);

-- ─── Quote requests ─────────────────────────────────────────────────────────
create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete set null,
  customer_name text not null,
  phone text,
  project_type text,
  details text,
  timeline text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_requests_status_idx on quote_requests (status, created_at desc);

-- ─── General messages ───────────────────────────────────────────────────────
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete set null,
  customer_name text not null,
  phone text,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_read_idx on messages (read, created_at desc);

-- ─── Per-call log (always written on call end) ──────────────────────────────
create table if not exists call_log (
  id uuid primary key default gen_random_uuid(),
  call_sid text not null,
  caller_number text,
  started_at timestamptz,
  ended_at timestamptz,
  summary text,
  transcript jsonb,
  created_at timestamptz not null default now()
);
create index if not exists call_log_created_idx on call_log (created_at desc);
create index if not exists call_log_call_sid_idx on call_log (call_sid);
