-- KeralAI Receptionist — tenant-configurable assistant identity & behavior
--
-- Generalises the assistant so no single person's identity is hardcoded. The
-- deployed system prompt (bridge/shared/maya-config.mjs and lib/maya-config.ts)
-- is now generic; everything tenant-specific is supplied by these columns and
-- edited from the dashboard → Settings.
--
--   assistant_name     How the assistant introduces itself. Empty means the
--                      assistant simply describes itself as the AI assistant.
--   assistant_language Preferred spoken language(s). Free text, e.g.
--                      "Malayalam and English". Empty means "match the caller".
--   additional_info    Extra owner-approved facts the assistant may share,
--                      injected into the approved profile block.
--   end_call_enabled   Allow the assistant to hang up once the caller clearly
--                      signals the conversation is finished.
--
-- Apply with:
--   npm run migrate        (recommended; tracked in schema_migrations)
--
-- Idempotent: safe to re-run.

alter table company_profile
  add column if not exists assistant_name text not null default '',
  add column if not exists assistant_language text not null default '',
  add column if not exists additional_info text not null default '',
  add column if not exists end_call_enabled boolean not null default true;

-- Transcript speaker normalisation: the old hardcoded persona label ("maya")
-- becomes the neutral "assistant". Existing call transcripts are preserved.
update call_transcript_turns
   set role = 'assistant'
 where role = 'maya';
