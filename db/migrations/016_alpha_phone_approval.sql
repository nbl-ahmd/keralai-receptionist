-- Approval governs new paid activation; revocation never releases a DID.
alter table tenant_subscriptions add column phone_activation_approved boolean not null default false;
alter table phone_numbers add column initial_setup_price_minor bigint check(initial_setup_price_minor>=0);
alter table phone_numbers add column provider_exposure_minor bigint check(provider_exposure_minor>=0);
-- Existing immutable ledger rows and uncertain reservations remain untouched.
alter table phone_numbers add column release_requested_at timestamptz;
alter table phone_numbers add column release_requested_by text;
