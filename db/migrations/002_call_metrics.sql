-- KeralAI Receptionist — per-call performance metrics
--
-- One row per completed call, written by the bridge at call end so latency and
-- throughput can be reviewed later in the dashboard. Apply with:
--   npm run migrate        (recommended; tracked in schema_migrations)
-- or
--   psql "$DATABASE_URL" -f db/migrations/002_call_metrics.sql
--
-- Idempotent: safe to re-run.

create table if not exists call_metrics (
  call_id uuid primary key references calls(id) on delete cascade,
  call_sid text not null,
  channel text not null default 'phone',
  outcome text,
  duration_sec integer not null default 0,
  gemini_connect_ms integer,

  in_chunks integer not null default 0,
  in_bytes bigint not null default 0,
  out_frames integer not null default 0,
  out_bytes bigint not null default 0,

  in_proc_avg_ms real,
  in_proc_p95_ms real,
  out_proc_avg_ms real,
  out_proc_p95_ms real,

  turn_count integer not null default 0,
  turn_avg_ms real,
  turn_p95_ms real,

  interrupts integer not null default 0,
  tools jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists call_metrics_created_idx on call_metrics (created_at desc);
create index if not exists call_metrics_call_sid_idx on call_metrics (call_sid);
