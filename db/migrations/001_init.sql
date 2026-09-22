-- KeralAI Receptionist — production schema
--
-- Apply with:
--   psql "$DATABASE_URL" -f db/migrations/001_init.sql
--
-- Idempotent: safe to re-run.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ─── Company profile (single row) ───────────────────────────────────────────
create table if not exists company_profile (
  id integer primary key default 1,
  name text not null default '',
  industry text not null default '',
  description text not null default '',
  address text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  updated_at timestamptz not null default now(),
  constraint company_profile_singleton check (id = 1)
);

-- ─── Knowledge base ─────────────────────────────────────────────────────────
create table if not exists knowledge_items (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'text',
  title text not null,
  content text not null,
  file_name text,
  date_added timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists knowledge_embeddings (
  id bigserial primary key,
  item_id uuid not null references knowledge_items(id) on delete cascade,
  chunk_index integer not null default 0,
  chunk_text text not null,
  embedding vector(3072) not null,
  created_at timestamptz not null default now(),
  unique (item_id, chunk_index)
);

-- ─── Contacts (CRM-facing identity) ─────────────────────────────────────────
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  email text,
  company text,
  source text not null default 'call',
  crm_provider text,
  crm_id text,
  last_contact_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Calls ──────────────────────────────────────────────────────────────────
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  call_sid text not null unique,
  contact_id uuid references contacts(id) on delete set null,
  caller text not null default 'Unknown caller',
  phone text,
  channel text not null default 'phone',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec integer not null default 0,
  outcome text not null default 'answered',
  intent text,
  summary text,
  sentiment text default 'neutral',
  recording_url text,
  created_at timestamptz not null default now()
);

create table if not exists call_transcript_turns (
  id bigserial primary key,
  call_id uuid not null references calls(id) on delete cascade,
  seq integer not null,
  role text not null,
  content text not null,
  at timestamptz not null default now()
);

create table if not exists call_knowledge_queries (
  id bigserial primary key,
  call_id uuid not null references calls(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now()
);

-- ─── Appointments ───────────────────────────────────────────────────────────
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  date date not null,
  time text not null,
  reason text,
  notes text,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── CRM sync audit trail ───────────────────────────────────────────────────
create table if not exists crm_sync_events (
  id bigserial primary key,
  contact_id uuid references contacts(id) on delete cascade,
  provider text not null,
  direction text not null default 'push',
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists knowledge_embeddings_item_idx on knowledge_embeddings (item_id);
create index if not exists calls_started_at_idx on calls (started_at desc);
create index if not exists calls_outcome_idx on calls (outcome);
create index if not exists appointments_date_idx on appointments (date, time);
create index if not exists appointments_status_idx on appointments (status);
create index if not exists contacts_phone_idx on contacts (phone);
create index if not exists contacts_email_idx on contacts (email);
create index if not exists transcript_call_idx on call_transcript_turns (call_id, seq);
create index if not exists crm_sync_contact_idx on crm_sync_events (contact_id, created_at desc);

-- ─── Seed the singleton profile row ─────────────────────────────────────────
insert into company_profile (id) values (1) on conflict (id) do nothing;
