-- Persist only opaque correlation identifiers and allowlisted diagnostics.
-- Existing uncertain accounts have no correlation username and require support.
alter table tenant_telephony_accounts add column if not exists provider_username text;
create unique index if not exists telephony_provider_username_unique
  on tenant_telephony_accounts(provider,provider_username) where provider_username is not null;
alter table voicelink_checkouts add column if not exists locked_monthly_minor bigint check(locked_monthly_minor>=0);
alter table voicelink_checkouts add column if not exists recovery_checked_at timestamptz;
alter table voicelink_checkouts add column if not exists recovery_code text;
update voicelink_checkouts set locked_monthly_minor=(quote->>'monthlyMinor')::bigint
  where locked_monthly_minor is null and quote->>'monthlyMinor' ~ '^[0-9]{1,9}$';
create index if not exists voicelink_recovery_pending on voicelink_checkouts(recovery_checked_at,updated_at)
  where state in ('creating','draft_unknown','quoted','confirming','purchase_unknown','purchased','assignment_unknown');
