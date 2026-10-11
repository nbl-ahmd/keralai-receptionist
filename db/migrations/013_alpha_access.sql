-- Plan configuration is data. Limits may be changed by audited operators.
create table plans (
  code text primary key, display_name text not null, active boolean not null default true,
  monthly_price_minor bigint not null default 0 check(monthly_price_minor>=0),
  version integer not null default 1, entitlements jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into plans(code,display_name,entitlements) values
('alpha','Alpha','{"browser_voice":true,"phone_inbound":true,"phone_outbound":false,"number_purchase":true,"knowledge_upload":true,"assistant_edit":true,"team_invite":false,"byok":true,"phone_concurrency":1,"browser_concurrency":1,"max_session_seconds":600,"phone_minutes":60,"browser_seconds":3600,"browser_daily_seconds":900,"monthly_spend_minor":50000,"monthly_ai_budget_minor":10000,"ai_reserve_minor":100,"promo_credit_minor":25000,"knowledge_items":50,"allow_overage":false}'),
('internal','Internal','{"browser_voice":true,"phone_inbound":true,"phone_outbound":false,"number_purchase":true,"knowledge_upload":true,"assistant_edit":true,"team_invite":false,"byok":true,"phone_concurrency":1,"browser_concurrency":1,"max_session_seconds":900,"phone_minutes":300,"browser_seconds":18000,"browser_daily_seconds":3600,"monthly_spend_minor":100000,"monthly_ai_budget_minor":50000,"ai_reserve_minor":100,"promo_credit_minor":0,"knowledge_items":500,"allow_overage":false}');
create table tenant_subscriptions (
 tenant_id uuid primary key references tenants(id), plan_code text not null references plans(code),
 status text not null default 'active' check(status in('active','trialing','past_due','grace_period','suspended','cancelled')),
 period_start timestamptz not null default (date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),
 period_end timestamptz not null default ((date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC'),
 voice_enabled boolean not null default true, purchase_enabled boolean not null default true,
 spend_cap_minor bigint check(spend_cap_minor>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(period_end>period_start)
);
-- Existing developers retain access and BYOK without an email allowlist.
insert into tenant_subscriptions(tenant_id,plan_code) select id,'internal' from tenants;
create table alpha_invites (
 id uuid primary key default gen_random_uuid(), code_hash text not null unique,
 email text,created_by text not null,max_uses integer not null default 1 check(max_uses between 1 and 100),
 uses integer not null default 0 check(uses>=0 and uses<=max_uses),
 expires_at timestamptz not null,status text not null default 'active' check(status in('active','revoked','consumed')),
 created_at timestamptz not null default now(),used_at timestamptz,
 metadata jsonb not null default '{}'::jsonb
);
create table alpha_invite_redemptions (
 invite_id uuid not null references alpha_invites(id),user_id text not null references "user"(id),
 tenant_id uuid not null unique references tenants(id),created_at timestamptz not null default now(),
 primary key(invite_id,user_id)
);
alter table wallet_transactions drop constraint wallet_transactions_type_check;
alter table wallet_transactions add constraint wallet_transactions_type_check
 check(type in('topup','call_usage','number_rental','refund','adjustment','promotional_credit','number_setup','correction'));
alter table platform_audit_events add column reason text,add column reference text;
create table alpha_operator_events (
 id uuid primary key default gen_random_uuid(),actor_id text not null,action text not null,
 resource_id text,reason text not null,reference text,created_at timestamptz not null default now()
);
create table alpha_rate_limits (
 subject_hash text not null,operation text not null,window_start timestamptz not null,
 requests integer not null default 1,primary key(subject_hash,operation,window_start)
);
