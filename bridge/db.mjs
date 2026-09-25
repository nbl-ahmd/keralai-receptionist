/**
 * bridge/db.mjs
 *
 * Postgres access for the Exotel phone bridge (standalone Node service).
 *
 * Every tenant-owned function takes `tenantId` as its first argument. There is
 * no global/profile singleton: the tenant is resolved from the Exotel URL token
 * or the signed browser bridge token before any data is read or written.
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
// Tenant resolution
// ---------------------------------------------------------------------------

/** Resolves a tenant by slug. Returns { id, name, slug, is_legacy } | null. */
export async function getTenantBySlug(slug) {
  if (!slug) return null;
  const rows = await dbQuery(
    `select id, name, slug, is_legacy from tenants where slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

/** Resolves a tenant by id. Returns { id, name, slug, is_legacy } | null. */
export async function getTenantById(tenantId) {
  if (!tenantId) return null;
  const rows = await dbQuery(
    `select id, name, slug, is_legacy from tenants where id = $1`,
    [tenantId],
  );
  return rows[0] ?? null;
}

/** The single pre-multitenancy "legacy" tenant, if one exists. */
export async function getLegacyTenant() {
  const rows = await dbQuery(
    `select id, name, slug, is_legacy from tenants where is_legacy = true order by created_at asc limit 1`,
  );
  return rows[0] ?? null;
}

/** Loads a tenant's stored Exotel token hash (server-only). */
export async function getTenantBridgeCredential(tenantId) {
  const rows = await dbQuery(
    `select token_hash from tenant_bridge_credentials where tenant_id = $1`,
    [tenantId],
  );
  return rows[0]?.token_hash ?? null;
}

/** Reads one non-secret tenant setting (jsonb), returning `fallback` if unset. */
export async function getTenantSetting(tenantId, key, fallback = null) {
  const rows = await dbQuery(
    `select value from tenant_settings where tenant_id = $1 and key = $2`,
    [tenantId, key],
  );
  const value = rows[0]?.value;
  return value === undefined || value === null ? fallback : value;
}

/** Loads the stored runtime-mode row for a tenant (server-only). */
export async function getTenantRuntimeState(tenantId) {
  const rows = await dbQuery(
    `select tenant_id, mode, label, instruction, expires_at, updated_by, updated_at
       from tenant_runtime_state where tenant_id = $1`,
    [tenantId],
  );
  const row = rows[0];
  if (!row) {
    return { tenantId, mode: 'available', label: null, instruction: null, expiresAt: null };
  }
  return {
    tenantId: row.tenant_id,
    mode: row.mode,
    label: row.label,
    instruction: row.instruction,
    expiresAt: row.expires_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Company profile (per tenant)
// ---------------------------------------------------------------------------

/** Fetches only the updated_at timestamp — cheap version check for the cache. */
export async function getProfileVersion(tenantId) {
  const rows = await dbQuery(
    `select updated_at from company_profile where tenant_id = $1`,
    [tenantId],
  );
  return rows[0]?.updated_at ?? null;
}

export async function loadCompanyProfile(tenantId) {
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

  const empty = { name: '', industry: '', description: '', contactEmail: '', contactPhone: '', address: '' };

  try {
    const rows = await dbQuery(
      `select name, industry, description, address, contact_email, contact_phone,
              voice_name, voice_pitch, voice_speed, greeting_enabled, greeting_text
         from company_profile where tenant_id = $1`,
      [tenantId],
    );
    return rows[0] ? map(rows[0]) : empty;
  } catch (error) {
    // Pre-003 schema (voice setting columns absent): fall back to base columns.
    console.error(
      '[bridge][db] voice setting columns missing — run migrations:',
      error.message,
    );
    const rows = await dbQuery(
      `select name, industry, description, address, contact_email, contact_phone
         from company_profile where tenant_id = $1`,
      [tenantId],
    );
    return rows[0] ? map(rows[0]) : empty;
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/**
 * Finds or creates the contact that a call belongs to, within one tenant.
 * @param {string} tenantId
 * @param {{ name?: string|null, phone?: string|null, source?: string }} input
 */
export async function upsertContact(tenantId, input) {
  const name = input.name ?? null;
  const phone = input.phone?.trim() || null;

  if (phone) {
    const existing = await dbQuery(
      `select id from contacts where tenant_id = $1 and phone = $2 order by created_at limit 1`,
      [tenantId, phone],
    );
    if (existing[0]) {
      await dbQuery(
        `update contacts set name = coalesce($3, name), last_contact_at = now(), updated_at = now()
          where id = $1 and tenant_id = $2`,
        [existing[0].id, tenantId, name],
      );
      return existing[0].id;
    }
  }

  const inserted = await dbQuery(
    `insert into contacts (tenant_id, name, phone, source, last_contact_at)
     values ($1, $2, $3, $4, now()) returning id`,
    [tenantId, name, phone, input.source ?? 'phone'],
  );
  return inserted[0].id;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

/** Inserts or updates the call row, replacing its transcript and knowledge-query rows. */
export async function upsertCallRecord(tenantId, call) {
  const contactId = await upsertContact(tenantId, {
    name: call.caller && call.caller !== 'Unknown caller' ? call.caller : null,
    phone: call.phone ?? null,
    source: call.channel === 'phone' ? 'phone' : 'web',
  });

  const rows = await dbQuery(
    `insert into calls (tenant_id, call_sid, contact_id, caller, phone, channel, started_at, ended_at,
                        duration_sec, outcome, intent, summary, sentiment)
     values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8::timestamptz, $9, $10, $11, $12, $13)
     on conflict (tenant_id, call_sid) do update set
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
      tenantId,
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
  await dbQuery(`delete from call_transcript_turns where tenant_id = $1 and call_id = $2`, [tenantId, callId]);
  const turns = call.transcript ?? [];
  if (turns.length > 0) {
    const values = [];
    const placeholders = turns
      .map((turn, index) => {
        values.push(tenantId, callId, index, turn.role, turn.text, turn.at);
        const base = index * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::timestamptz)`;
      })
      .join(', ');
    await dbQuery(
      `insert into call_transcript_turns (tenant_id, call_id, seq, role, content, at) values ${placeholders}`,
      values,
    );
  }

  // Replace knowledge queries
  await dbQuery(`delete from call_knowledge_queries where tenant_id = $1 and call_id = $2`, [tenantId, callId]);
  const queries = call.knowledgeQueries ?? [];
  if (queries.length > 0) {
    const values = [];
    const placeholders = queries
      .map((query, index) => {
        values.push(tenantId, callId, query);
        const base = index * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(', ');
    await dbQuery(
      `insert into call_knowledge_queries (tenant_id, call_id, query) values ${placeholders}`,
      values,
    );
  }

  return callId;
}

// ---------------------------------------------------------------------------
// Call metrics (per-call latency/throughput, for dashboard audits)
// ---------------------------------------------------------------------------

/**
 * Persists aggregate latency/throughput metrics for a completed call.
 * One row per call (keyed by call_id). Best-effort: logs, never throws.
 */
export async function upsertCallMetrics(tenantId, callId, metrics) {
  if (!callId || !metrics) return false;
  try {
    await dbQuery(
      `insert into call_metrics (
         tenant_id, call_id, call_sid, channel, outcome, duration_sec, gemini_connect_ms,
         in_chunks, in_bytes, out_frames, out_bytes,
         in_proc_avg_ms, in_proc_p95_ms, out_proc_avg_ms, out_proc_p95_ms,
         turn_count, turn_avg_ms, turn_p95_ms, interrupts, tools, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb, now())
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
         updated_at = now()
       where call_metrics.tenant_id = excluded.tenant_id`,
      [
        tenantId,
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
 * Books an appointment for a phone call within a tenant.
 *
 * Idempotent across calls/processes: a transaction-scoped advisory lock
 * serialises bookings for the same (tenant, name, date, time), and an existing
 * confirmed appointment for that slot is returned instead of inserting a
 * duplicate.
 */
export async function persistAppointment(tenantId, callSid, args, callId = null) {
  if (!args?.customerName || !args?.date || !args?.time) {
    throw new Error('persistAppointment: customerName, date and time are required');
  }

  const phone = args.phone?.trim() || null;
  const lockKey = `${tenantId}|${args.customerName}|${args.date}|${args.time}`.toLowerCase();

  const { row, existed } = await withTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1)::bigint)', [lockKey]);

    const existing = await client.query(
      `select id, customer_name, to_char(date, 'YYYY-MM-DD') as date, time, reason, status
         from appointments
        where tenant_id = $1
          and lower(customer_name) = lower($2) and date = $3::date and time = $4
          and status in ('pending','confirmed')
        order by created_at
        limit 1`,
      [tenantId, args.customerName, args.date, args.time],
    );
    if (existing.rows[0]) return { row: existing.rows[0], existed: true };

    let resolvedCallId = callId;
    if (!resolvedCallId) {
      const callRows = await client.query(
        `select id from calls where tenant_id = $1 and call_sid = $2`,
        [tenantId, callSid],
      );
      resolvedCallId = callRows.rows[0]?.id ?? null;
    }

    const contactRows = await client.query(
      `insert into contacts (tenant_id, name, phone, source, last_contact_at)
       values ($1, $2, $3, 'phone', now()) returning id`,
      [tenantId, args.customerName, phone],
    );

    const inserted = await client.query(
      `insert into appointments (tenant_id, call_id, contact_id, customer_name, customer_phone, date, time, reason, status)
       values ($1, $2, $3, $4, $5, $6::date, $7, $8, 'pending')
       returning id, customer_name, to_char(date, 'YYYY-MM-DD') as date, time, reason, status, created_at`,
      [tenantId, resolvedCallId, contactRows.rows[0].id, args.customerName, phone, args.date, args.time, args.reason ?? null],
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

/** Resolve `calls.id` for a call_sid within a tenant, unless already known. */
async function resolveCallId(tenantId, callSid, callId) {
  if (callId) return callId;
  const rows = await dbQuery(
    `select id from calls where tenant_id = $1 and call_sid = $2`,
    [tenantId, callSid],
  );
  return rows[0]?.id ?? null;
}

/** requestCallback → callback_requests (status 'pending'). */
export async function persistCallbackRequest(tenantId, callSid, args, callId = null) {
  if (!args?.customerName) throw new Error('requestCallback: customerName is required');
  const resolvedCallId = await resolveCallId(tenantId, callSid, callId);
  const rows = await dbQuery(
    `insert into callback_requests (tenant_id, call_id, customer_name, phone, preferred_time, reason, status)
     values ($1, $2, $3, $4, $5, $6, 'pending')
     returning id, customer_name, preferred_time, status`,
    [tenantId, resolvedCallId, args.customerName, args.phone?.trim() || null, args.preferredTime ?? null, args.reason ?? null],
  );
  const row = rows[0];
  console.log(`[bridge] Callback request persisted: ${row.id}`);
  return { id: row.id, customerName: row.customer_name, preferredTime: row.preferred_time, status: row.status };
}

/** captureQuoteRequest → quote_requests (status 'new'). */
export async function persistQuoteRequest(tenantId, callSid, args, callId = null) {
  if (!args?.customerName) throw new Error('captureQuoteRequest: customerName is required');
  const resolvedCallId = await resolveCallId(tenantId, callSid, callId);
  const rows = await dbQuery(
    `insert into quote_requests (tenant_id, call_id, customer_name, phone, project_type, details, timeline, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'new')
     returning id, customer_name, project_type, status`,
    [
      tenantId,
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
export async function persistMessage(tenantId, callSid, args, callId = null) {
  if (!args?.customerName || !args?.message) {
    throw new Error('takeMessage: customerName and message are required');
  }
  const resolvedCallId = await resolveCallId(tenantId, callSid, callId);
  const rows = await dbQuery(
    `insert into messages (tenant_id, call_id, customer_name, phone, message)
     values ($1, $2, $3, $4, $5)
     returning id, customer_name`,
    [tenantId, resolvedCallId, args.customerName, args.phone?.trim() || null, args.message],
  );
  const row = rows[0];
  console.log(`[bridge] Message persisted: ${row.id}`);
  return { id: row.id, customerName: row.customer_name };
}

/** Always-on per-call log row. Best-effort; never throws. */
export async function persistCallLog(tenantId, { callSid, callerNumber, startedAt, endedAt, summary, transcript }) {
  try {
    await dbQuery(
      `insert into call_log (tenant_id, call_sid, caller_number, started_at, ended_at, summary, transcript)
       values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7::jsonb)`,
      [
        tenantId,
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
 * Loads active assistant instructions for a tenant at the start of a new call.
 *
 * Instructions are injected directly into the Live system instruction and are
 * intentionally never embedded, so this is a plain row read (no vector search).
 * Fails open to an empty list: a DB/migration problem must not block calls.
 */
export async function loadActiveInstructions(tenantId) {
  try {
    return await dbQuery(
      `select id, title, content, updated_at
         from knowledge_items
        where tenant_id = $1
          and type = 'instruction'
          and is_active = true
          and length(trim(content)) > 0
        order by updated_at desc`,
      [tenantId],
    );
  } catch (error) {
    console.error('[bridge][db] failed to load active instructions:', error.message);
    return [];
  }
}

/**
 * Vector search over one tenant's knowledge base using pgvector.
 * @param {string} tenantId
 * @param {string} queryVectorText  pgvector literal, e.g. "[0.1,0.2,...]"
 * @param {number} limit
 */
export async function searchKnowledgeEmbeddings(tenantId, queryVectorText, limit = 3) {
  const rows = await dbQuery(
    `select chunk_text, 1 - (embedding <=> $1::vector) as score
       from knowledge_embeddings
      where tenant_id = $2
      order by embedding <=> $1::vector
      limit $3`,
    [queryVectorText, tenantId, limit],
  );
  return rows.map((row) => ({ text: row.chunk_text, score: Number(row.score) }));
}

// ---------------------------------------------------------------------------
// CRM audit
// ---------------------------------------------------------------------------

/** Writes a CRM sync attempt to the audit table, scoped to a tenant. */
export async function logCrmSyncEvent(tenantId, { callSid, provider, status, error }) {
  try {
    const callRows = await dbQuery(
      `select contact_id from calls where tenant_id = $1 and call_sid = $2`,
      [tenantId, callSid],
    );
    const contactId = callRows[0]?.contact_id;
    if (!contactId) return;
    await dbQuery(
      `insert into crm_sync_events (tenant_id, contact_id, provider, direction, status, payload, error)
       values ($1, $2, $3, 'push', $4, $5::jsonb, $6)`,
      [tenantId, contactId, provider, status, JSON.stringify({ callSid }), error ?? null],
    );
  } catch (err) {
    console.error('[bridge][crm] Failed to record sync event:', err.message);
  }
}
