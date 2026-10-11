-- Query support and one usage budget per call. No legacy data changes.
create index if not exists calls_tenant_started_idx on calls(tenant_id,started_at desc);
create index if not exists phone_numbers_rental_due_idx on phone_numbers(next_rental_at) where status in ('active','suspended');
create index if not exists telephony_usage_pending_idx on telephony_usage_events(updated_at) where billing_status='pending';
create index if not exists telephony_webhook_pending_idx on telephony_webhook_events(tenant_id,created_at) where status<>'processed';
