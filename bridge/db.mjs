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
  const result = await getPool().query(text, params);
  return result.rows;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
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
  const rows = await dbQuery(
    `select name, industry, description, address, contact_email, contact_phone
       from company_profile where id = 1`,
  );
  const row = rows[0];
  if (!row) {
    return { name: '', industry: '', description: '', contactEmail: '', contactPhone: '', address: '' };
  }
  return {
    name: row.name,
    industry: row.industry,
    description: row.description,
    address: row.address,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
  };
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
// Appointments
// ---------------------------------------------------------------------------

/**
 * Books an appointment for a phone call.
 *
 * `callId` is optional: when the caller already knows the `calls.id` (created
 * at call start) it skips a lookup. Otherwise the id is resolved by call_sid.
 *
 * @param {string} callSid
 * @param {{ customerName: string, date: string, time: string, reason?: string }} args
 * @param {string|null} [callId]
 */
export async function persistAppointment(callSid, args, callId = null) {
  if (!args?.customerName || !args?.date || !args?.time) {
    throw new Error('persistAppointment: customerName, date and time are required');
  }

  let resolvedCallId = callId;
  if (!resolvedCallId) {
    const callRows = await dbQuery(`select id from calls where call_sid = $1`, [callSid]);
    resolvedCallId = callRows[0]?.id ?? null;
  }

  const contactId = await upsertContact({ name: args.customerName, source: 'phone' });

  const rows = await dbQuery(
    `insert into appointments (call_id, contact_id, customer_name, date, time, reason, status)
     values ($1, $2, $3, $4::date, $5, $6, 'confirmed')
     returning id, customer_name, to_char(date, 'YYYY-MM-DD') as date, time, reason, status, created_at`,
    [resolvedCallId, contactId, args.customerName, args.date, args.time, args.reason ?? null],
  );

  const row = rows[0];
  console.log(`[bridge] 📅 Appointment persisted: ${row.id} for ${row.customer_name}`);
  return {
    id: row.id,
    customerName: row.customer_name,
    date: row.date,
    time: row.time,
    reason: row.reason,
    status: row.status,
  };
}

// ---------------------------------------------------------------------------
// Knowledge search
// ---------------------------------------------------------------------------

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
