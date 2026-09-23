-- KeralAI Receptionist — dashboard-controlled agent voice & greeting settings
--
-- Adds voice/pitch/speed and greeting settings to the singleton company_profile
-- row so they can be edited in the dashboard and picked up by the bridge.
-- Apply with:
--   npm run migrate        (recommended; tracked in schema_migrations)
-- or
--   psql "$DATABASE_URL" -f db/migrations/003_agent_settings.sql
--
-- Idempotent: safe to re-run.

alter table company_profile
  add column if not exists voice_name text not null default 'Aoede',
  add column if not exists voice_pitch text not null default 'Normal',
  add column if not exists voice_speed text not null default 'Normal',
  add column if not exists greeting_enabled boolean not null default true,
  add column if not exists greeting_text text;
