-- Shared atomic alpha request/session-start allowance; not monetary billing.
create table if not exists alpha_ai_daily_usage (
  tenant_id uuid not null references tenants(id) on delete cascade,
  usage_date date not null,
  requests integer not null check (requests > 0),
  primary key (tenant_id, usage_date)
);
