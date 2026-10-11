-- Existing workspaces retain BYOK. Invite-created tenants explicitly select managed AI.
create table tenant_ai_configuration (
  tenant_id uuid primary key references tenants(id),
  credential_mode text not null check (credential_mode in ('platform_managed','tenant_managed')),
  updated_at timestamptz not null default now()
);
insert into tenant_ai_configuration(tenant_id,credential_mode)
select id,'tenant_managed' from tenants;
