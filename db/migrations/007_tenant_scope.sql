-- KeralAI Receptionist — tenant scope for all tenant-owned tables
--
-- Adds `tenant_id` to every tenant-owned table, backfills all existing rows
-- into the legacy tenant, and replaces global uniqueness with tenant-aware
-- uniqueness. Data is preserved; nothing is deleted.
--
-- Apply with:
--   npm run migrate
--
-- Idempotent: safe to re-run.

-- ─── Company profile ────────────────────────────────────────────────────────
-- Was a singleton (id = 1 with a check constraint). Becomes one row per tenant.
alter table company_profile drop constraint if exists company_profile_singleton;
alter table company_profile add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update company_profile
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table company_profile alter column tenant_id set not null;

-- Allow multiple profile rows (one per tenant) by replacing the fixed default.
create sequence if not exists company_profile_id_seq;
alter sequence company_profile_id_seq owned by company_profile.id;
alter table company_profile alter column id set default nextval('company_profile_id_seq');
select setval(
  'company_profile_id_seq',
  greatest(coalesce((select max(id) from company_profile), 1), 1)
);
alter table company_profile drop constraint if exists company_profile_tenant_key;
alter table company_profile add constraint company_profile_tenant_key unique (tenant_id);

-- ─── Reusable helper (documentation only) ───────────────────────────────────
-- Every block below follows the same three steps:
--   1. add tenant_id (nullable) + FK
--   2. backfill from the parent row when one exists, else the legacy tenant
--   3. enforce NOT NULL and add a tenant-aware index

-- ─── Knowledge ──────────────────────────────────────────────────────────────
alter table knowledge_items
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update knowledge_items
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table knowledge_items alter column tenant_id set not null;
create index if not exists knowledge_items_tenant_idx
  on knowledge_items (tenant_id, date_added desc);
create index if not exists knowledge_items_tenant_instruction_idx
  on knowledge_items (tenant_id, type, is_active, updated_at desc);

alter table knowledge_embeddings
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update knowledge_embeddings e
   set tenant_id = i.tenant_id
  from knowledge_items i
 where e.item_id = i.id and e.tenant_id is null;
update knowledge_embeddings
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table knowledge_embeddings alter column tenant_id set not null;
create index if not exists knowledge_embeddings_tenant_idx
  on knowledge_embeddings (tenant_id);

-- ─── Contacts ───────────────────────────────────────────────────────────────
alter table contacts
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update contacts
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table contacts alter column tenant_id set not null;
create index if not exists contacts_tenant_phone_idx on contacts (tenant_id, phone);
create index if not exists contacts_tenant_email_idx on contacts (tenant_id, email);
create index if not exists contacts_tenant_recent_idx
  on contacts (tenant_id, coalesce(last_contact_at, created_at) desc);

-- ─── Calls (call_sid was globally UNIQUE; make it tenant-scoped) ────────────
alter table calls drop constraint if exists calls_call_sid_key;
alter table calls
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update calls
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table calls alter column tenant_id set not null;
alter table calls add constraint calls_tenant_call_sid_key unique (tenant_id, call_sid);
create index if not exists calls_tenant_started_idx on calls (tenant_id, started_at desc);
create index if not exists calls_tenant_outcome_idx on calls (tenant_id, outcome);

-- ─── Call children ──────────────────────────────────────────────────────────
alter table call_transcript_turns
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update call_transcript_turns t
   set tenant_id = c.tenant_id
  from calls c
 where t.call_id = c.id and t.tenant_id is null;
update call_transcript_turns
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table call_transcript_turns alter column tenant_id set not null;
create index if not exists call_transcript_turns_tenant_idx
  on call_transcript_turns (tenant_id, call_id, seq);

alter table call_knowledge_queries
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update call_knowledge_queries q
   set tenant_id = c.tenant_id
  from calls c
 where q.call_id = c.id and q.tenant_id is null;
update call_knowledge_queries
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table call_knowledge_queries alter column tenant_id set not null;
create index if not exists call_knowledge_queries_tenant_idx
  on call_knowledge_queries (tenant_id, call_id);

-- ─── Call metrics ───────────────────────────────────────────────────────────
alter table call_metrics
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update call_metrics m
   set tenant_id = c.tenant_id
  from calls c
 where m.call_id = c.id and m.tenant_id is null;
update call_metrics
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table call_metrics alter column tenant_id set not null;
create index if not exists call_metrics_tenant_created_idx
  on call_metrics (tenant_id, created_at desc);

-- ─── Appointments ───────────────────────────────────────────────────────────
alter table appointments
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update appointments
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table appointments alter column tenant_id set not null;
create index if not exists appointments_tenant_date_idx on appointments (tenant_id, date, time);
create index if not exists appointments_tenant_status_idx on appointments (tenant_id, status);

-- ─── Call actions ───────────────────────────────────────────────────────────
alter table callback_requests
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update callback_requests
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table callback_requests alter column tenant_id set not null;
create index if not exists callback_requests_tenant_status_idx
  on callback_requests (tenant_id, status, created_at desc);

alter table quote_requests
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update quote_requests
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table quote_requests alter column tenant_id set not null;
create index if not exists quote_requests_tenant_status_idx
  on quote_requests (tenant_id, status, created_at desc);

alter table messages
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update messages
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table messages alter column tenant_id set not null;
create index if not exists messages_tenant_read_idx on messages (tenant_id, read, created_at desc);

alter table crm_sync_events
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update crm_sync_events e
   set tenant_id = c.tenant_id
  from contacts c
 where e.contact_id = c.id and e.tenant_id is null;
update crm_sync_events
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table crm_sync_events alter column tenant_id set not null;
create index if not exists crm_sync_events_tenant_idx
  on crm_sync_events (tenant_id, contact_id, created_at desc);

alter table call_log
  add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update call_log
   set tenant_id = (select id from tenants where is_legacy = true limit 1)
 where tenant_id is null;
alter table call_log alter column tenant_id set not null;
create index if not exists call_log_tenant_created_idx on call_log (tenant_id, created_at desc);
