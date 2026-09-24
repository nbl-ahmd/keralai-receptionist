-- KeralAI Receptionist — active assistant instructions
--
-- Instructions are stored in the same knowledge_items table but are never
-- embedded. Active instructions are loaded directly from Postgres at the start
-- of every new call and injected into the Gemini Live system instruction.
--
-- Apply with:
--   npm run migrate        (recommended; tracked in schema_migrations)
-- or
--   psql "$DATABASE_URL" -f db/migrations/005_active_instructions.sql
--
-- Idempotent: safe to re-run.

-- Active flag. Only meaningful for type = 'instruction'; normal knowledge
-- always stores true.
alter table knowledge_items
  add column if not exists is_active boolean not null default true;

-- Fast lookup for the bridge's "active instructions at call start" query.
create index if not exists knowledge_items_instruction_idx
on knowledge_items (type, is_active, updated_at desc);

-- Migrate the legacy sleeping instruction (previously mis-stored as plain text).
update knowledge_items
set type = 'instruction',
    is_active = true
where title = 'Call Handling Instruction - Sleeping'
  and type = 'text';

-- Instructions must never appear in normal vector search. Remove any stale
-- embeddings for instruction rows; normal knowledge embeddings are untouched.
delete from knowledge_embeddings
where item_id in (
  select id
  from knowledge_items
  where type = 'instruction'
);
