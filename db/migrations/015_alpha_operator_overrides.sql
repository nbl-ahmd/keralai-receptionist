alter table tenant_subscriptions add column entitlement_overrides jsonb not null default '{}'::jsonb;
create index alpha_invites_status_expiry on alpha_invites(status,expires_at);
create index alpha_audit_tenant_time on platform_audit_events(tenant_id,created_at desc);
create index alpha_sessions_created on alpha_voice_sessions(created_at);
