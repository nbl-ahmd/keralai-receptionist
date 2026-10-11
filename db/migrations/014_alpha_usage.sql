create table platform_usage_controls (
 id integer primary key check(id=1),browser_enabled boolean not null default true,
 phone_enabled boolean not null default false,purchase_enabled boolean not null default false,
 max_active_sessions integer not null default 10 check(max_active_sessions>0),
 daily_voice_seconds integer not null default 36000 check(daily_voice_seconds>=0),
 monthly_voice_seconds integer not null default 180000 check(monthly_voice_seconds>=0),
 monthly_provider_cap_minor bigint not null default 100000 check(monthly_provider_cap_minor>=0),
 monthly_ai_cap_minor bigint not null default 100000 check(monthly_ai_cap_minor>=0),
 updated_at timestamptz not null default now()
);
insert into platform_usage_controls(id) values(1);
create table alpha_voice_sessions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),
 user_id text,kind text not null check(kind in('browser','phone','legacy')),
 provider_call_id text,phone_number_id uuid,
 state text not null default 'authorized' check(state in('authorized','active','closed')),
 settlement text not null default 'pending' check(settlement in('pending','settled')),
 token_hash text unique,token_expires_at timestamptz not null,
 started_at timestamptz,created_at timestamptz not null default now(),expires_at timestamptz not null,
 ended_at timestamptz,end_reason text,
 reserved_seconds integer not null check(reserved_seconds>=0),used_seconds integer not null default 0 check(used_seconds>=0),
 reserved_minor bigint not null default 0 check(reserved_minor>=0),
 provider_reserved_minor bigint not null default 0 check(provider_reserved_minor>=0),
 ai_estimated_minor bigint not null default 0 check(ai_estimated_minor>=0),
 provider_actual_minor bigint,ai_actual_minor bigint,customer_charge_minor bigint,
 ai_tokens bigint,plan_code text not null,plan_version integer not null,
 pricing_version text not null,period_start timestamptz not null,period_end timestamptz not null,
 limits_snapshot jsonb not null,
 foreign key(tenant_id,phone_number_id) references phone_numbers(tenant_id,id),
 unique(kind,provider_call_id),unique(tenant_id,id)
);
create index alpha_sessions_active on alpha_voice_sessions(tenant_id,kind,expires_at) where state<>'closed';
create index alpha_sessions_period on alpha_voice_sessions(tenant_id,period_start);
create table alpha_ai_usage (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants(id),
 operation text not null,estimated_minor bigint not null check(estimated_minor>=0),actual_minor bigint,
 tokens bigint,plan_code text not null,plan_version integer not null,period_start timestamptz not null,
 created_at timestamptz not null default now()
);
create index alpha_ai_usage_period on alpha_ai_usage(tenant_id,period_start);
alter table telephony_usage_events add column alpha_session_id uuid references alpha_voice_sessions(id);
