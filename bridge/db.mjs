/**
 * bridge/db.mjs
 *
 * Postgres access for the Exotel phone bridge (standalone Node service).
 *
 * Uses the `pg` Pool — correct driver for a long-lived process.
 * Must be connected to Neon's POOLED (PgBouncer) endpoint in production
 * so the pool's connections go through PgBouncer and respect Neon's limits.
 *
 * Keep the SQL in sync with lib/store.ts when schemas change.
 */

import { createRequire } from 'node:module';
import { SLOW_DB_MS, hrNow, msSince, processMetrics } from './metrics.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — the phone bridge needs Neon Postgres.');
  }
  const queryTimeout = Number(process.env.PG_QUERY_TIMEOUT_MS ?? 15_000);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Cap how long any single query can tie up a pooled connection so a slow
    // query can never exhaust the pool or hang a tool call indefinitely.
    query_timeout: queryTimeout,
    statement_timeout: queryTimeout,
    application_name: 'keralai-bridge',
    ssl: process.env.DATABASE_URL.includes('sslmode=require')
      ? { rejectUnauthorized: false }
      : undefined,
  });
  pool.on('error', (error) => console.error('[bridge][db] idle client error:', error));
  return pool;
}

export async function dbQuery(text, params = []) {
  const startedNs = hrNow();
  try {
    const result = await getPool().query(text, params);
    const ms = msSince(startedNs);
    processMetrics.dbQueries++;
    processMetrics.dbLatency.record(ms);
    if (ms >= SLOW_DB_MS) {
      processMetrics.dbSlow++;
      console.warn(
        `[bridge][db] slow query ${ms.toFixed(0)}ms: ${text.replace(/\s+/g, ' ').trim().slice(0, 90)}`,
      );
    }
    return result.rows;
  } catch (error) {
    processMetrics.dbErrors++;
    console.error('[bridge][db] query failed:', error.message);
    throw error;
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Runs `fn(client)` inside a single transaction on one pooled connection.
 * Used for operations that must hold a lock or be atomic.
 */
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

/** Fetches only the updated_at timestamp — cheap version check for the profile cache. */
export async function getProfileVersion() {
  const rows = await dbQuery(
    `select updated_at from company_profile where id = 1`,
  );
  return rows[0]?.updated_at ?? null;
}

export async function loadCompanyProfile() {
  const map = (row) => ({
    name: row.name,
    industry: row.industry,
    description: row.description,
    address: row.address,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    voiceName: row.voice_name ?? undefined,
    voicePitch: row.voice_pitch ?? undefined,
    voiceSpeed: row.voice_speed ?? undefined,
    greetingEnabled: row.greeting_enabled ?? undefined,
    greetingText: row.greeting_text ?? null,
  });

  try {
    const rows = await dbQuery(
      `select name, industry, description, address, contact_email, contact_phone,
              voice_name, voice_pitch, voice_speed, greeting_enabled, greeting_text
         from company_profile where id = 1`,
    );
    return rows[0]
      ? map(rows[0])
      : { name: '', industry: '', description: '', contactEmail: '', contactPhone: '', address: '' };
  } catch (error) {
    // Pre-003 schema (voice setting columns absent): fall back to base columns.
    console.error(
      '[bridge][db] voice setting columns missing — run migrations:',
      error.message,
    );
    const rows = await dbQuery(
      `select name, industry, description, address, contact_email, contact_phone
         from company_profile where id = 1`,
    );
    return rows[0]
      ? map(rows[0])
      : { name: '', industry: '', description: '', contactEmail: '', contactPhone: '', address: '' };
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/**
 * Finds or creates the contact that a call belongs to.
 * @param {{ name?: string|null, phone?: string|null, source?: string }} input
 */
export async function upsertContact(input) {
  const name = input.name ?? null;
  const phone = input.phone?.trim() || null;

  if (phone) {
    const existing = await dbQuery(
      `select id from contacts where phone = $1 order by created_at limit 1`,
      [phone],
    );
    if (existing[0]) {
      await dbQuery(
        `update contacts set name = coalesce($2, name), last_contact_at = now(), updated_at = now()
          where id = $1`,
        [existing[0].id, name],
      );
      return existing[0].id;
    }
  }

  const inserted = await dbQuery(
    `insert into contacts (name, phone, source, last_contact_at)
     values ($1, $2, $3, now()) returning id`,
    [name, phone, input.source ?? 'phone'],
  );
  return inserted[0].id;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** Inserts or updates the call row, replacing its transcript and knowledge-query rows. */
export async function upsertCallRecord(call) {
  const contactId = await upsertContact({
    name: call.caller && call.caller !== 'Unknown caller' ? call.caller : null,
    phone: call.phone ?? null,
    source: call.channel === 'phone' ? 'phone' : 'web',
  });

  const rows = await dbQuery(
    `insert into calls (call_sid, contact_id, caller, phone, channel, started_at, ended_at,
                        duration_sec, outcome, intent, summary, sentiment)
     values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7::timestamptz, $8, $9, $10, $11, $12)
     on conflict (call_sid) do update set
       contact_id = excluded.contact_id,
       caller = excluded.caller,
       phone = excluded.phone,
       channel = excluded.channel,
       ended_at = excluded.ended_at,
       duration_sec = excluded.duration_sec,
       outcome = excluded.outcome,
       intent = excluded.intent,
       summary = excluded.summary,
       sentiment = excluded.sentiment
     returning id`,
    [
      call.callSid,
      contactId,
      call.caller || 'Unknown caller',
      call.phone ?? null,
      call.channel ?? 'phone',
      call.startedAt ?? null,
      call.endedAt ?? null,
      call.durationSec ?? 0,
      call.outcome ?? 'answered',
      call.intent ?? null,
      call.summary ?? null,
      call.sentiment ?? 'neutral',
    ],
  );
  const callId = rows[0].id;

  // Replace transcript turns
  await dbQuery(`delete from call_transcript_turns where call_id = $1`, [callId]);
  const turns = call.transcript ?? [];
  if (turns.length > 0) {
    const values = [];
    const placeholders = turns
      .map((turn, index) => {
        values.push(callId, index, turn.role, turn.text, turn.at);
        const base = index * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::timestamptz)`;
      })
      .join(', ');
    await dbQuery(
      `insert into call_transcript_turns (call_id, seq, role, content, at) values ${placeholders}`,
      values,
    );
  }

  // Replace knowledge queries
  await dbQuery(`delete from call_knowledge_queries where call_id = $1`, [callId]);
  const queries = call.knowledgeQueries ?? [];
  if (queries.length > 0) {
    const values = [];
    const placeholders = queries
      .map((query, index) => {
        values.push(callId, query);
        const base = index * 2;
        return `($${base + 1}, $${base + 2})`;
      })
      .join(', ');
    await dbQuery(`insert into call_knowledge_queries (call_id, query) values ${placeholders}`, values);
  }

  return callId;
}

// ---------------------------------------------------------------------------
// Call metrics (per-call latency/throughput, for dashboard audits)
// ---------------------------------------------------------------------------

/**
 * Persists aggregate latency/throughput metrics for a completed call.
 * One row per call (keyed by call_id). Best-effort: logs, never throws.
 *
 * @param {string} callId  `calls.id`
 * @param {object} metrics  Flattened CallMetrics snapshot (see metrics.mjs)
 * @returns {Promise<boolean>}
 */
export async function upsertCallMetrics(callId, metrics) {
  if (!callId || !metrics) return false;
  try {
    await dbQuery(
      `insert into call_metrics (
         call_id, call_sid, channel, outcome, duration_sec, gemini_connect_ms,
         in_chunks, in_bytes, out_frames, out_bytes,
         in_proc_avg_ms, in_proc_p95_ms, out_proc_avg_ms, out_proc_p95_ms,
         turn_count, turn_avg_ms, turn_p95_ms, interrupts, tools, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb, now())
       on conflict (call_id) do update set
         call_sid = excluded.call_sid,
         channel = excluded.channel,
         outcome = excluded.outcome,
         duration_sec = excluded.duration_sec,
         gemini_connect_ms = excluded.gemini_connect_ms,
         in_chunks = excluded.in_chunks,
         in_bytes = excluded.in_bytes,
         out_frames = excluded.out_frames,
         out_bytes = excluded.out_bytes,
         in_proc_avg_ms = excluded.in_proc_avg_ms,
         in_proc_p95_ms = excluded.in_proc_p95_ms,
         out_proc_avg_ms = excluded.out_proc_avg_ms,
         out_proc_p95_ms = excluded.out_proc_p95_ms,
         turn_count = excluded.turn_count,
         turn_avg_ms = excluded.turn_avg_ms,
         turn_p95_ms = excluded.turn_p95_ms,
         interrupts = excluded.interrupts,
         tools = excluded.tools,
         updated_at = now()`,
      [
        callId,
        metrics.callSid,
        metrics.channel ?? 'phone',
        metrics.outcome ?? null,
        metrics.durationSec ?? 0,
        metrics.geminiConnectMs ?? null,
        metrics.inChunks ?? 0,
        metrics.inBytes ?? 0,
        metrics.outFrames ?? 0,
        metrics.outBytes ?? 0,
        metrics.inProcAvg ?? null,
        metrics.inProcP95 ?? null,
        metrics.outProcAvg ?? null,
        metrics.outProcP95 ?? null,
        metrics.turnCount ?? 0,
        metrics.turnAvgMs ?? null,
        metrics.turnP95Ms ?? null,
        metrics.interrupts ?? 0,
        JSON.stringify(metrics.tools ?? {}),
      ],
    );
    return true;
  } catch (error) {
    console.error('[bridge][db] Failed to persist call metrics:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/**
 * Books an appointment for a phone call.
 *
 * Idempotent across calls/processes: a transaction-scoped advisory lock
 * serialises bookings for the same (name, date, time), and an existing
 * confirmed appointment for that slot is returned instead of inserting a
 * duplicate. (No schema change / unique index, so the Next.js `addAppointment`
 * path is unaffected.)
 *
 * `callId` is optional: when the caller already knows the `calls.id` (created
 * at call start) it skips a lookup. Otherwise the id is resolved by call_sid.
 *
 * @param {string} callSid
 * @param {{ customerName: string, phone?: string, date: string, time: string, reason?: string }} args
 * @param {string|null} [callId]
 */
export async function persistAppointment(callSid, args, callId = null) {
  if (!args?.customerName || !args?.date || !args?.time) {
    throw new Error('persistAppointment: customerName, date and time are required');
  }

  const phone = args.phone?.trim() || null;
  const lockKey = `${args.customerName}|${args.date}|${args.time}`.toLowerCase();

  const { row, existed } = await withTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1)::bigint)', [lockKey]);

    const existing = await client.query(
      `select id, customer_name, to_char(date, 'YYYY-MM-DD') as date, time, reason, status
         from appointments
        where lower(customer_name) = lower($1) and date = $2::date and time = $3
          and status in ('pending','confirmed')
        order by created_at
        limit 1`,
      [args.customerName, args.date, args.time],
    );
    if (existing.rows[0]) return { row: existing.rows[0], existed: true };

    let resolvedCallId = callId;
    if (!resolvedCallId) {
      const callRows = await client.query(`select id from calls where call_sid = $1`, [callSid]);
      resolvedCallId = callRows.rows[0]?.id ?? null;
    }

    const contactRows = await client.query(
      `insert into contacts (name, phone, source, last_contact_at)
       values ($1, $2, 'phone', now()) returning id`,
      [args.customerName, phone],
    );

    const inserted = await client.query(
      `insert into appointments (call_id, contact_id, customer_name, customer_phone, date, time, reason, status)
       values ($1, $2, $3, $4, $5::date, $6, $7, 'pending')
       returning id, customer_name, to_char(date, 'YYYY-MM-DD') as date, time, reason, status, created_at`,
      [resolvedCallId, contactRows.rows[0].id, args.customerName, phone, args.date, args.time, args.reason ?? null],
    );
    return { row: inserted.rows[0], existed: false };
  });

  if (!existed) console.log(`[bridge] Appointment persisted: ${row.id} for ${row.customer_name}`);
  return {
    id: row.id,
    customerName: row.customer_name,
    date: row.date,
    time: row.time,
    reason: row.reason,
    status: row.status,
    existed,
  };
}

// ---------------------------------------------------------------------------
// Call actions: callback requests, quote requests, messages, call log
// ---------------------------------------------------------------------------

/** Resolve `calls.id` for a call_sid, unless already known. */
async function resolveCallId(callSid, callId) {
  if (callId) return callId;
  const rows = await dbQuery(`select id from calls where call_sid = $1`, [callSid]);
  return rows[0]?.id ?? null;
}

/** requestCallback → callback_requests (status 'pending'). */
export async function persistCallbackRequest(callSid, args, callId = null) {
  if (!args?.customerName) throw new Error('requestCallback: customerName is required');
  const resolvedCallId = await resolveCallId(callSid, callId);
  const rows = await dbQuery(
    `insert into callback_requests (call_id, customer_name, phone, preferred_time, reason, status)
     values ($1, $2, $3, $4, $5, 'pending')
     returning id, customer_name, preferred_time, status`,
    [resolvedCallId, args.customerName, args.phone?.trim() || null, args.preferredTime ?? null, args.reason ?? null],
  );
  const row = rows[0];
  console.log(`[bridge] Callback request persisted: ${row.id}`);
  return { id: row.id, customerName: row.customer_name, preferredTime: row.preferred_time, status: row.status };
}

/** captureQuoteRequest → quote_requests (status 'new'). */
export async function persistQuoteRequest(callSid, args, callId = null) {
  if (!args?.customerName) throw new Error('captureQuoteRequest: customerName is required');
  const resolvedCallId = await resolveCallId(callSid, callId);
  const rows = await dbQuery(
    `insert into quote_requests (call_id, customer_name, phone, project_type, details, timeline, status)
     values ($1, $2, $3, $4, $5, $6, 'new')
     returning id, customer_name, project_type, status`,
    [
      resolvedCallId,
      args.customerName,
      args.phone?.trim() || null,
      args.projectType ?? null,
      args.details ?? null,
      args.timeline ?? null,
    ],
  );
  const row = rows[0];
  console.log(`[bridge] Quote request persisted: ${row.id}`);
  return { id: row.id, customerName: row.customer_name, projectType: row.project_type, status: row.status };
}

/** takeMessage → messages (read false). */
export async function persistMessage(callSid, args, callId = null) {
  if (!args?.customerName || !args?.message) {
    throw new Error('takeMessage: customerName and message are required');
  }
  const resolvedCallId = await resolveCallId(callSid, callId);
  const rows = await dbQuery(
    `insert into messages (call_id, customer_name, phone, message)
     values ($1, $2, $3, $4)
     returning id, customer_name`,
    [resolvedCallId, args.customerName, args.phone?.trim() || null, args.message],
  );
  const row = rows[0];
  console.log(`[bridge] Message persisted: ${row.id}`);
  return { id: row.id, customerName: row.customer_name };
}

/** Always-on per-call log row. Best-effort; never throws. */
export async function persistCallLog({ callSid, callerNumber, startedAt, endedAt, summary, transcript }) {
  try {
    await dbQuery(
      `insert into call_log (call_sid, caller_number, started_at, ended_at, summary, transcript)
       values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6::jsonb)`,
      [
        callSid,
        callerNumber ?? null,
        startedAt ?? null,
        endedAt ?? null,
        summary ?? null,
        transcript ? JSON.stringify(transcript) : null,
      ],
    );
    return true;
  } catch (error) {
    console.error('[bridge][db] Failed to write call_log:', error.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Knowledge search
// ---------------------------------------------------------------------------

/**
 * Loads active assistant instructions for the start of a new call.
 *
 * Instructions are injected directly into the Live system instruction and are
 * intentionally never embedded, so this is a plain row read (no vector search).
 * Fails open to an empty list: a DB/migration problem must not block calls.
 *
 * @returns {Promise<Array<{ id: string, title: string, content: string, updated_at: unknown }>>}
 */
export async function loadActiveInstructions() {
  try {
    return await dbQuery(
      `select id, title, content, updated_at
         from knowledge_items
        where type = 'instruction'
          and is_active = true
          and length(trim(content)) > 0
        order by updated_at desc`,
    );
  } catch (error) {
    console.error('[bridge][db] failed to load active instructions:', error.message);
    return [];
  }
}

/**
 * Vector search over the knowledge base using pgvector.
 * @param {string} queryVectorText  pgvector literal, e.g. "[0.1,0.2,...]"
 * @param {number} limit
 */
export async function searchKnowledgeEmbeddings(queryVectorText, limit = 3) {
  const rows = await dbQuery(
    `select chunk_text, 1 - (embedding <=> $1::vector) as score
       from knowledge_embeddings
       order by embedding <=> $1::vector
       limit $2`,
    [queryVectorText, limit],
  );
  return rows.map((row) => ({ text: row.chunk_text, score: Number(row.score) }));
}

// ---------------------------------------------------------------------------
// CRM audit
// ---------------------------------------------------------------------------

/** Writes a CRM sync attempt to the audit table. */
export async function logCrmSyncEvent({ callSid, provider, status, error }) {
  try {
    const callRows = await dbQuery(`select contact_id from calls where call_sid = $1`, [callSid]);
    const contactId = callRows[0]?.contact_id;
    if (!contactId) return;
    await dbQuery(
      `insert into crm_sync_events (contact_id, provider, direction, status, payload, error)
       values ($1, $2, 'push', $3, $4::jsonb, $5)`,
      [contactId, provider, status, JSON.stringify({ callSid }), error ?? null],
    );
  } catch (err) {
    console.error('[bridge][crm] Failed to record sync event:', err.message);
  }
}
