-- Durable reseller purchase intents. A draft timeout must never recreate a lock
-- or repeat a paid confirmation. No provider credentials or identity data.
create table if not exists voicelink_checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  telephony_account_id uuid not null,
  e164 text not null check(e164 ~ '^\+91[0-9]{10}$'),
  provider_did_id text not null,
  provider_order_id text,
  provider_purchase_id text,
  phone_number_id uuid,
  idempotency_key text not null,
  state text not null default 'creating' check(state in
    ('creating','draft_unknown','quoted','confirming','purchase_unknown','purchased','assignment_unknown','assigned','expired')),
  quote jsonb,
  expires_at timestamptz,
  accepted_terms_reference text,
  accepted_charge_minor bigint check(accepted_charge_minor>=0),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(tenant_id,telephony_account_id) references tenant_telephony_accounts(tenant_id,id),
  foreign key(tenant_id,phone_number_id) references phone_numbers(tenant_id,id),
  unique(tenant_id,idempotency_key)
);
create unique index if not exists voicelink_checkout_one_open on voicelink_checkouts(tenant_id)
  where state <> 'expired';
