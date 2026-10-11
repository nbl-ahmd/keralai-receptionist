-- Additive managed telephony. Applied transactionally by scripts/migrate.mjs.
alter table company_profile
  add column assistant_purpose text not null default 'business' check (assistant_purpose in ('personal','business','other')),
  add column assistant_instructions text not null default '';
alter table tenants add column if not exists status text not null default 'active'
  check (status in ('active', 'suspended'));

create table tenant_onboarding (
  tenant_id uuid primary key references tenants(id),
  purpose text not null default 'personal' check (purpose in ('personal','business','other')),
  step text not null default 'purpose' check (step in ('purpose','identity','behavior','knowledge','test','phone','complete')),
  browser_test_completed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
-- Existing customers keep their working dashboard; new tenants start onboarding.
insert into tenant_onboarding (tenant_id, step, completed_at)
select id, 'complete', now() from tenants;

create table tenant_telephony_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  provider text not null,
  provider_account_id text,
  provider_auth_id text,
  kyc_mode text not null default 'customer_use' check (kyc_mode = 'customer_use'),
  business_type text not null default 'individual',
  kyc_status text not null default 'not_started'
    check (kyc_status in ('not_started','pending','verified','failed')),
  kyc_calls_blocked boolean not null default true,
  document_states jsonb not null default '{}',
  status text not null default 'creating'
    check (status in ('creating','active','suspended','needs_review','failed')),
  kyc_session_id text,
  kyc_session_status text,
  kyc_session_expires_at timestamptz,
  kyc_verified_at timestamptz,
  kyc_last_checked_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider), unique (provider, provider_auth_id), unique (tenant_id, id)
);

create table phone_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  telephony_account_id uuid not null,
  provider text not null,
  provider_number_id text,
  e164 text not null check (e164 ~ '^\+[1-9][0-9]{7,14}$'),
  country text not null default 'IN',
  region text,
  number_type text not null default 'local',
  capabilities jsonb not null default '{"voice":true}',
  status text not null default 'requested' check (status in
    ('requested','kyc_required','payment_required','provisioning','configuring','active','suspended','failed','releasing','released')),
  provisioning_status text not null default 'requested' check (provisioning_status in
    ('requested','purchasing','purchase_unknown','purchased','configuring','configuration_failed','active','release_unknown','released')),
  provider_monthly_cost numeric(14,5),
  customer_monthly_price_minor bigint not null check (customer_monthly_price_minor >= 0),
  initial_charge_minor bigint not null check (initial_charge_minor >= 0),
  application_id text,
  error_code text,
  idempotency_key text not null,
  activated_at timestamptz,
  next_rental_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, telephony_account_id) references tenant_telephony_accounts(tenant_id,id),
  unique (tenant_id,id), unique (tenant_id,idempotency_key)
);
create unique index phone_numbers_live_e164 on phone_numbers(e164) where status <> 'released';
-- Beta: one dedicated DID per assistant. Also prevents different double-submit keys.
create unique index phone_numbers_one_per_tenant on phone_numbers(tenant_id) where status <> 'released';

create table wallet_accounts (
  tenant_id uuid primary key references tenants(id),
  currency text not null default 'INR' check (currency = 'INR'),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now()
);
create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references wallet_accounts(tenant_id),
  type text not null check (type in ('topup','call_usage','number_rental','refund','adjustment')),
  amount_minor bigint not null check (amount_minor <> 0),
  currency text not null default 'INR' check (currency = 'INR'),
  reference_type text not null,
  reference_id text not null,
  idempotency_key text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (tenant_id,idempotency_key)
);
create index wallet_transactions_balance on wallet_transactions(tenant_id);
create function prevent_wallet_mutation() returns trigger language plpgsql as $$
begin raise exception 'Wallet ledger is append-only'; end $$;
create trigger wallet_transactions_immutable before update or delete on wallet_transactions
for each row execute function prevent_wallet_mutation();
create table wallet_holds (
  tenant_id uuid not null references wallet_accounts(tenant_id),
  phone_number_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'reserved' check (status in ('reserved','captured','released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,phone_number_id),
  foreign key (tenant_id,phone_number_id) references phone_numbers(tenant_id,id)
);

create table telephony_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  phone_number_id uuid not null,
  provider text not null,
  provider_call_id text not null,
  direction text not null check (direction in ('inbound','outbound')),
  from_number text not null,
  to_number text not null,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds >= 0),
  billable_seconds integer check (billable_seconds >= 0),
  provider_cost numeric(14,5), ai_cost numeric(14,5), platform_cost numeric(14,5),
  customer_charge_minor bigint,
  rate_per_minute_minor bigint not null check (rate_per_minute_minor > 0),
  reserved_minor bigint not null default 0 check (reserved_minor >= 0),
  currency text not null default 'INR',
  billing_status text not null default 'pending' check (billing_status in ('pending','charged','unbillable','needs_review')),
  call_status text not null default 'ringing',
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id,phone_number_id) references phone_numbers(tenant_id,id),
  unique (provider,provider_call_id), unique (tenant_id,idempotency_key)
);
create index telephony_usage_tenant_date on telephony_usage_events(tenant_id,started_at desc);

-- Metadata only. Never persist KYC documents or raw provider payloads.
create table telephony_webhook_events (
  provider text not null,
  event_key text not null,
  tenant_id uuid not null references tenants(id),
  event_type text not null,
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider,event_key)
);
create table telephony_nonces (
  nonce_hash text primary key,
  tenant_id uuid not null references tenants(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table platform_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  tenant_id uuid not null references tenants(id),
  action text not null,
  resource_id text,
  created_at timestamptz not null default now()
);
create table telephony_rate_limits (
  tenant_id uuid not null references tenants(id),
  operation text not null,
  window_start timestamptz not null,
  requests integer not null default 1,
  primary key (tenant_id,operation,window_start)
);
