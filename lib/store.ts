/**
 * store.ts
 *
 * Postgres (Neon) data layer for the receptionist platform.
 *
 * Replaces the earlier flat-file store. All dashboard data — profile, knowledge,
 * embeddings, contacts, calls, and appointments — lives in Neon, so the Next.js
 * API routes and the Exotel phone bridge share one durable source of truth.
 *
 * Search uses pgvector cosine distance. Embeddings are 3072-dimensional, which
 * exceeds pgvector's 2000-dimension index limit, so similarity runs as an exact
 * scan. That is fast for typical knowledge bases (hundreds of chunks); move to a
 * halfvec index if you ever exceed that.
 */

import { GoogleGenAI } from "@google/genai";
import {
  Appointment,
  CallMetric,
  CallMetricsSummary,
  CallOutcome,
  CallRecord,
  CompanyProfile,
  Contact,
  DashboardMetrics,
  KnowledgeItem,
  ToolMetric,
  TranscriptTurn,
  VOICE_OPTIONS,
  VoiceName,
  VoicePitch,
  VoiceSpeed,
} from "../types";
import { query, queryOne } from "../db/client";

// Re-export shared shapes so server-side callers can import them from one place.
export type { Contact } from "../types";

export const EMBEDDING_MODEL = "gemini-embedding-2";
export const CHUNK_SIZE = 500;

export const EMPTY_PROFILE: CompanyProfile = {
  name: "",
  industry: "",
  description: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
};

export interface KnowledgeEmbedding {
  itemId: string;
  chunkIndex: number;
  text: string;
  values: number[];
}

export interface KnowledgeSearchResult {
  text: string;
  score: number;
  itemId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Formats a JS array as a pgvector literal. */
function toVector(values: number[]): string {
  return `[${values.join(",")}]`;
}

/**
 * Reads a `date` column as text.
 * node-postgres parses `date` into a local-midnight Date, which shifts the day
 * when converted to UTC — so appointment queries always select dates with
 * to_char(...) instead of returning the raw column.
 */
function toDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function getApiKey(): string | null {
  return process.env.GEMINI_API_KEY ?? null;
}

export function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(vecA.length, vecB.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function embedText(text: string): Promise<number[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
  });
  const values = response.embeddings?.[0]?.values;
  if (!values) throw new Error("Embedding model returned no values");
  return values;
}

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

interface ProfileRow {
  name: string;
  industry: string;
  description: string;
  address: string;
  contact_email: string;
  contact_phone: string;
  voice_name: string | null;
  voice_pitch: string | null;
  voice_speed: string | null;
  greeting_enabled: boolean | null;
  greeting_text: string | null;
}

const VOICE_IDS = new Set<string>(VOICE_OPTIONS.map((option) => option.id));

function normalizeVoiceName(value: unknown): VoiceName {
  const candidate = String(value ?? "");
  return VOICE_IDS.has(candidate) ? (candidate as VoiceName) : "Aoede";
}

function normalizePitch(value: unknown): VoicePitch {
  const candidate = String(value ?? "");
  return candidate === "Low" || candidate === "High" ? candidate : "Normal";
}

function normalizeSpeed(value: unknown): VoiceSpeed {
  const candidate = String(value ?? "");
  return candidate === "Slow" || candidate === "Fast" ? candidate : "Normal";
}

/** Accepts legacy keys (location/email/phone) and normalises to CompanyProfile. */
export function normalizeProfile(input: Record<string, unknown>): CompanyProfile {
  const greetingText =
    input.greetingText === null || input.greetingText === undefined
      ? null
      : String(input.greetingText).slice(0, 500);
  return {
    name: String(input.name ?? ""),
    industry: String(input.industry ?? ""),
    description: String(input.description ?? ""),
    address: String(input.address ?? input.location ?? ""),
    contactEmail: String(input.contactEmail ?? input.email ?? ""),
    contactPhone: String(input.contactPhone ?? input.phone ?? ""),
    voiceName: normalizeVoiceName(input.voiceName),
    voicePitch: normalizePitch(input.voicePitch),
    voiceSpeed: normalizeSpeed(input.voiceSpeed),
    // Default on unless explicitly disabled.
    greetingEnabled: input.greetingEnabled === undefined ? true : Boolean(input.greetingEnabled),
    greetingText: greetingText && greetingText.trim() ? greetingText : null,
  };
}

const PROFILE_SELECT = `
  select name, industry, description, address, contact_email, contact_phone,
         voice_name, voice_pitch, voice_speed, greeting_enabled, greeting_text
    from company_profile where id = 1`;

function mapProfileRow(row: ProfileRow): CompanyProfile {
  return {
    name: row.name,
    industry: row.industry,
    description: row.description,
    address: row.address,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    voiceName: normalizeVoiceName(row.voice_name),
    voicePitch: normalizePitch(row.voice_pitch),
    voiceSpeed: normalizeSpeed(row.voice_speed),
    greetingEnabled: row.greeting_enabled ?? true,
    greetingText: row.greeting_text ?? null,
  };
}

export async function getProfile(): Promise<CompanyProfile> {
  try {
    const row = await queryOne<ProfileRow>(PROFILE_SELECT);
    return row ? mapProfileRow(row) : { ...EMPTY_PROFILE };
  } catch (error) {
    // Pre-003 schema (voice setting columns absent): fall back to base columns.
    console.warn("[store] voice setting columns missing, run migrations:", error instanceof Error ? error.message : error);
    const row = await queryOne<ProfileRow>(
      `select name, industry, description, address, contact_email, contact_phone
         from company_profile where id = 1`,
    );
    return row ? mapProfileRow(row) : { ...EMPTY_PROFILE };
  }
}

export async function saveProfile(profile: CompanyProfile): Promise<CompanyProfile> {
  const normalised = normalizeProfile(profile as unknown as Record<string, unknown>);
  await query(
    `insert into company_profile (
       id, name, industry, description, address, contact_email, contact_phone,
       voice_name, voice_pitch, voice_speed, greeting_enabled, greeting_text, updated_at)
     values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
     on conflict (id) do update set
       name = excluded.name,
       industry = excluded.industry,
       description = excluded.description,
       address = excluded.address,
       contact_email = excluded.contact_email,
       contact_phone = excluded.contact_phone,
       voice_name = excluded.voice_name,
       voice_pitch = excluded.voice_pitch,
       voice_speed = excluded.voice_speed,
       greeting_enabled = excluded.greeting_enabled,
       greeting_text = excluded.greeting_text,
       updated_at = now()`,
    [
      normalised.name,
      normalised.industry,
      normalised.description,
      normalised.address,
      normalised.contactEmail,
      normalised.contactPhone,
      normalised.voiceName,
      normalised.voicePitch,
      normalised.voiceSpeed,
      normalised.greetingEnabled,
      normalised.greetingText,
    ],
  );
  return normalised;
}

// ---------------------------------------------------------------------------
// Knowledge base + embeddings
// ---------------------------------------------------------------------------

interface KnowledgeRow {
  id: string;
  type: string;
  title: string;
  content: string;
  file_name: string | null;
  date_added: unknown;
}

function mapKnowledgeRow(row: KnowledgeRow): KnowledgeItem {
  return {
    id: row.id,
    type: row.type as KnowledgeItem["type"],
    title: row.title,
    content: row.content,
    fileName: row.file_name ?? undefined,
    dateAdded: new Date(toIso(row.date_added)),
  };
}

export async function getKnowledge(): Promise<KnowledgeItem[]> {
  const rows = await query<KnowledgeRow>(
    `select id, type, title, content, file_name, date_added
       from knowledge_items order by date_added desc`,
  );
  return rows.map(mapKnowledgeRow);
}

export async function getKnowledgeItem(id: string): Promise<KnowledgeItem | null> {
  if (!isUuid(id)) return null;
  const row = await queryOne<KnowledgeRow>(
    `select id, type, title, content, file_name, date_added from knowledge_items where id = $1`,
    [id],
  );
  return row ? mapKnowledgeRow(row) : null;
}

/** Inserts or updates a knowledge item, returning its (possibly generated) id. */
export async function upsertKnowledgeItem(item: KnowledgeItem): Promise<KnowledgeItem> {
  const id = isUuid(item.id) ? item.id : crypto.randomUUID();
  const rows = await query<KnowledgeRow>(
    `insert into knowledge_items (id, type, title, content, file_name, date_added, updated_at)
     values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), now())
     on conflict (id) do update set
       type = excluded.type,
       title = excluded.title,
       content = excluded.content,
       file_name = excluded.file_name,
       updated_at = now()
     returning id, type, title, content, file_name, date_added`,
    [id, item.type, item.title, item.content, item.fileName ?? null, item.dateAdded ?? null],
  );
  return mapKnowledgeRow(rows[0]);
}

/** Replaces all embeddings for an item with freshly chunked vectors. */
export async function reindexKnowledgeItem(item: KnowledgeItem): Promise<KnowledgeEmbedding[]> {
  const chunks = chunkText(`--- ${item.title} ---\n${item.content}`);
  const fresh: KnowledgeEmbedding[] = [];

  await query(`delete from knowledge_embeddings where item_id = $1`, [item.id]);

  for (const [chunkIndex, text] of chunks.entries()) {
    const values = await embedText(text);
    await query(
      `insert into knowledge_embeddings (item_id, chunk_index, chunk_text, embedding)
       values ($1, $2, $3, $4::vector)`,
      [item.id, chunkIndex, text, toVector(values)],
    );
    fresh.push({ itemId: item.id, chunkIndex, text, values });
  }

  return fresh;
}

export async function removeKnowledgeItem(id: string): Promise<void> {
  if (!isUuid(id)) return;
  // Embeddings cascade via the foreign key.
  await query(`delete from knowledge_items where id = $1`, [id]);
}

export async function getEmbeddings(): Promise<KnowledgeEmbedding[]> {
  const rows = await query<{
    item_id: string;
    chunk_index: number;
    chunk_text: string;
    embedding: string;
  }>(
    `select item_id, chunk_index, chunk_text, embedding::text as embedding
       from knowledge_embeddings order by item_id, chunk_index`,
  );
  return rows.map((row) => ({
    itemId: row.item_id,
    chunkIndex: row.chunk_index,
    text: row.chunk_text,
    values: row.embedding
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((value) => Number.parseFloat(value)),
  }));
}

export async function searchKnowledge(
  queryText: string,
  limit = 3,
): Promise<KnowledgeSearchResult[]> {
  const vector = await embedText(queryText);
  const rows = await query<{ chunk_text: string; item_id: string; score: number }>(
    `select e.chunk_text,
            e.item_id,
            1 - (e.embedding <=> $1::vector) as score
       from knowledge_embeddings e
       order by e.embedding <=> $1::vector
       limit $2`,
    [toVector(vector), limit],
  );
  return rows.map((row) => ({
    text: row.chunk_text,
    itemId: row.item_id,
    score: Number(row.score),
  }));
}

// ---------------------------------------------------------------------------
// Contacts (CRM identity)
// ---------------------------------------------------------------------------

interface ContactRow {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string;
  crm_provider: string | null;
  crm_id: string | null;
  last_contact_at: unknown;
}

function mapContactRow(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    company: row.company,
    source: row.source,
    crmProvider: row.crm_provider,
    crmId: row.crm_id,
    lastContactAt: row.last_contact_at ? toIso(row.last_contact_at) : null,
  };
}

export async function getContacts(): Promise<Contact[]> {
  const rows = await query<ContactRow>(
    `select id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at
       from contacts order by coalesce(last_contact_at, created_at) desc`,
  );
  return rows.map(mapContactRow);
}

/**
 * Finds a contact by phone/email or creates one, then stamps last_contact_at.
 * This is the identity anchor that calls and appointments hang off.
 */
export async function upsertContact(input: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  source?: string;
}): Promise<Contact> {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim() || null;

  let existing: ContactRow | null = null;
  if (phone || email) {
    existing = await queryOne<ContactRow>(
      `select id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at
         from contacts
        where ($1::text is not null and phone = $1)
           or ($2::text is not null and email = $2)
        order by created_at
        limit 1`,
      [phone, email],
    );
  }

  if (existing) {
    const rows = await query<ContactRow>(
      `update contacts set
         name = coalesce($2, name),
         phone = coalesce($3, phone),
         email = coalesce($4, email),
         company = coalesce($5, company),
         last_contact_at = now(),
         updated_at = now()
       where id = $1
       returning id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at`,
      [existing.id, input.name ?? null, phone, email, input.company ?? null],
    );
    return mapContactRow(rows[0]);
  }

  const rows = await query<ContactRow>(
    `insert into contacts (name, phone, email, company, source, last_contact_at)
     values ($1, $2, $3, $4, $5, now())
     returning id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at`,
    [input.name ?? null, phone, email, input.company ?? null, input.source ?? "call"],
  );
  return mapContactRow(rows[0]);
}

export async function updateContactCrmLink(
  contactId: string,
  provider: string,
  crmId: string,
): Promise<void> {
  if (!isUuid(contactId)) return;
  await query(
    `update contacts set crm_provider = $2, crm_id = $3, updated_at = now() where id = $1`,
    [contactId, provider, crmId],
  );
}

export async function logCrmSyncEvent(event: {
  contactId: string;
  provider: string;
  direction?: "push" | "pull";
  status: "success" | "failed" | "skipped";
  payload?: unknown;
  error?: string;
}): Promise<void> {
  if (!isUuid(event.contactId)) return;
  await query(
    `insert into crm_sync_events (contact_id, provider, direction, status, payload, error)
     values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      event.contactId,
      event.provider,
      event.direction ?? "push",
      event.status,
      JSON.stringify(event.payload ?? {}),
      event.error ?? null,
    ],
  );
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

interface AppointmentRow {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  date: unknown;
  time: string;
  reason: string | null;
  status: string;
  created_at: unknown;
  call_sid: string | null;
}

function mapAppointmentRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? undefined,
    customerEmail: row.customer_email ?? undefined,
    date: toDateOnly(row.date),
    time: row.time,
    reason: row.reason ?? undefined,
    status: row.status as Appointment["status"],
    callSid: row.call_sid ?? undefined,
    createdAt: toIso(row.created_at),
  };
}

const APPOINTMENT_COLUMNS = `a.id, a.customer_name, a.customer_phone, a.customer_email,
         to_char(a.date, 'YYYY-MM-DD') as date, a.time, a.reason, a.status,
         a.created_at, c.call_sid`;

const APPOINTMENT_SELECT = `
  select ${APPOINTMENT_COLUMNS}
    from appointments a
    left join calls c on c.id = a.call_id`;

export async function getAppointments(): Promise<Appointment[]> {
  const rows = await query<AppointmentRow>(`${APPOINTMENT_SELECT} order by a.date asc, a.time asc`);
  return rows.map(mapAppointmentRow);
}

export async function getAppointmentsForCall(callId: string): Promise<Appointment[]> {
  if (!isUuid(callId)) return [];
  const rows = await query<AppointmentRow>(
    `${APPOINTMENT_SELECT} where a.call_id = $1 order by a.date asc, a.time asc`,
    [callId],
  );
  return rows.map(mapAppointmentRow);
}

export async function addAppointment(appointment: Appointment): Promise<Appointment> {
  const id = isUuid(appointment.id) ? appointment.id : crypto.randomUUID();

  // Link to the originating call (and contact) when the call is known.
  let callId: string | null = null;
  if (appointment.callSid) {
    const call = await queryOne<{ id: string }>(`select id from calls where call_sid = $1`, [
      appointment.callSid,
    ]);
    callId = call?.id ?? null;
  }

  const rows = await query<AppointmentRow>(
    `insert into appointments (id, call_id, customer_name, customer_phone, customer_email, date, time, reason, status, created_at)
     values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, coalesce($10::timestamptz, now()))
     on conflict (id) do update set
       call_id = excluded.call_id,
       customer_name = excluded.customer_name,
       customer_phone = excluded.customer_phone,
       customer_email = excluded.customer_email,
       date = excluded.date,
       time = excluded.time,
       reason = excluded.reason,
       status = excluded.status,
       updated_at = now()
     returning id, customer_name, customer_phone, customer_email,
               to_char(date, 'YYYY-MM-DD') as date, time, reason, status, created_at,
               (select call_sid from calls where calls.id = appointments.call_id) as call_sid`,
    [
      id,
      callId,
      appointment.customerName,
      appointment.customerPhone ?? null,
      appointment.customerEmail ?? null,
      appointment.date,
      appointment.time,
      appointment.reason ?? null,
      appointment.status ?? "confirmed",
      appointment.createdAt ?? null,
    ],
  );
  return mapAppointmentRow(rows[0]);
}

export async function updateAppointmentStatus(
  id: string,
  status: Appointment["status"],
): Promise<Appointment | null> {
  if (!isUuid(id)) return null;
  const rows = await query<AppointmentRow>(
    `update appointments set status = $2, updated_at = now() where id = $1
     returning id, customer_name, customer_phone, customer_email,
               to_char(date, 'YYYY-MM-DD') as date, time, reason, status, created_at,
               (select call_sid from calls where calls.id = appointments.call_id) as call_sid`,
    [id, status],
  );
  return rows[0] ? mapAppointmentRow(rows[0]) : null;
}

export async function removeAppointment(id: string): Promise<void> {
  if (!isUuid(id)) return;
  await query(`delete from appointments where id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

interface CallRow {
  id: string;
  call_sid: string;
  caller: string;
  phone: string | null;
  channel: string;
  started_at: unknown;
  ended_at: unknown;
  duration_sec: number;
  outcome: string;
  intent: string | null;
  summary: string | null;
  sentiment: string | null;
  turns: TranscriptTurn[] | null;
  queries: string[] | null;
  booking_ids: string[] | null;
}

function mapCallRow(row: CallRow): CallRecord {
  return {
    id: row.id,
    callSid: row.call_sid,
    caller: row.caller,
    phone: row.phone ?? undefined,
    channel: row.channel as CallRecord["channel"],
    startedAt: toIso(row.started_at),
    endedAt: row.ended_at ? toIso(row.ended_at) : undefined,
    durationSec: row.duration_sec,
    outcome: row.outcome as CallOutcome,
    intent: row.intent ?? undefined,
    summary: row.summary ?? undefined,
    sentiment: (row.sentiment as CallRecord["sentiment"]) ?? "neutral",
    transcript: row.turns ?? [],
    knowledgeQueries: row.queries ?? [],
    bookingIds: row.booking_ids ?? [],
  };
}

const CALL_SELECT = `
  select c.id, c.call_sid, c.caller, c.phone, c.channel, c.started_at, c.ended_at,
         c.duration_sec, c.outcome, c.intent, c.summary, c.sentiment,
         coalesce(t.turns, '[]'::json) as turns,
         coalesce(k.queries, '[]'::json) as queries,
         coalesce(a.ids, '[]'::json) as booking_ids
    from calls c
    left join lateral (
      select json_agg(json_build_object('role', role, 'text', content, 'at', at) order by seq) as turns
        from call_transcript_turns where call_id = c.id
    ) t on true
    left join lateral (
      select json_agg(query order by id) as queries
        from call_knowledge_queries where call_id = c.id
    ) k on true
    left join lateral (
      select json_agg(id::text) as ids from appointments where call_id = c.id
    ) a on true`;

export async function getCalls(): Promise<CallRecord[]> {
  const rows = await query<CallRow>(`${CALL_SELECT} order by c.started_at desc`);
  return rows.map(mapCallRow);
}

export async function getCallBySid(callSid: string): Promise<CallRecord | null> {
  const rows = await query<CallRow>(`${CALL_SELECT} where c.call_sid = $1`, [callSid]);
  return rows[0] ? mapCallRow(rows[0]) : null;
}

/**
 * Inserts or updates a call by call_sid, replacing its transcript and
 * knowledge-query rows. Contacts are upserted from the caller identity.
 */
export async function upsertCall(call: CallRecord): Promise<CallRecord> {
  const contact = await upsertContact({
    name: call.caller && call.caller !== "Unknown caller" ? call.caller : null,
    phone: call.phone ?? null,
    source: call.channel === "phone" ? "phone" : "web",
  });

  const rows = await query<{ id: string }>(
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
      contact.id,
      call.caller || "Unknown caller",
      call.phone ?? null,
      call.channel ?? "phone",
      call.startedAt ?? null,
      call.endedAt ?? null,
      call.durationSec ?? 0,
      call.outcome ?? "answered",
      call.intent ?? null,
      call.summary ?? null,
      call.sentiment ?? "neutral",
    ],
  );
  const callId = rows[0].id;

  // Replace transcript turns
  await query(`delete from call_transcript_turns where call_id = $1`, [callId]);
  const turns = call.transcript ?? [];
  if (turns.length > 0) {
    const values: unknown[] = [];
    const placeholders = turns
      .map((turn, index) => {
        values.push(callId, index, turn.role, turn.text, turn.at);
        const base = index * 5;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::timestamptz)`;
      })
      .join(", ");
    await query(
      `insert into call_transcript_turns (call_id, seq, role, content, at) values ${placeholders}`,
      values,
    );
  }

  // Replace knowledge queries
  await query(`delete from call_knowledge_queries where call_id = $1`, [callId]);
  const queries = call.knowledgeQueries ?? [];
  if (queries.length > 0) {
    const values: unknown[] = [];
    const placeholders = queries
      .map((q, index) => {
        values.push(callId, q);
        const base = index * 2;
        return `($${base + 1}, $${base + 2})`;
      })
      .join(", ");
    await query(
      `insert into call_knowledge_queries (call_id, query) values ${placeholders}`,
      values,
    );
  }

  const saved = await getCallBySid(call.callSid);
  if (!saved) throw new Error("Failed to load saved call");
  return saved;
}

export async function removeCall(id: string): Promise<void> {
  if (!isUuid(id)) return;
  await query(`delete from calls where id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function getMetrics(): Promise<DashboardMetrics> {
  const row = await queryOne<{
    total_calls: string;
    answered: string;
    booked: string;
    escalated: string;
    missed: string;
    avg_duration: string | null;
    knowledge_items: string;
    appointments: string;
    confirmed_appointments: string;
    knowledge_lookups: string;
  }>(`
    select
      (select count(*) from calls) as total_calls,
      (select count(*) from calls where outcome not in ('missed','abandoned')) as answered,
      (select count(*) from calls where outcome = 'booked') as booked,
      (select count(*) from calls where outcome = 'escalated') as escalated,
      (select count(*) from calls where outcome = 'missed') as missed,
      (select avg(duration_sec) from calls) as avg_duration,
      (select count(*) from knowledge_items) as knowledge_items,
      (select count(*) from appointments) as appointments,
      (select count(*) from appointments where status = 'confirmed') as confirmed_appointments,
      (select count(*) from call_knowledge_queries) as knowledge_lookups
  `);

  return {
    totalCalls: Number(row?.total_calls ?? 0),
    answered: Number(row?.answered ?? 0),
    booked: Number(row?.booked ?? 0),
    escalated: Number(row?.escalated ?? 0),
    missed: Number(row?.missed ?? 0),
    avgDurationSec: Math.round(Number(row?.avg_duration ?? 0)),
    knowledgeItems: Number(row?.knowledge_items ?? 0),
    appointments: Number(row?.appointments ?? 0),
    confirmedAppointments: Number(row?.confirmed_appointments ?? 0),
    knowledgeLookups: Number(row?.knowledge_lookups ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Per-call performance metrics (written by the bridge at call end)
// ---------------------------------------------------------------------------

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value: number | null, digits = 1): number | null =>
  value === null ? null : Number(value.toFixed(digits));

interface CallMetricRow {
  call_id: string;
  call_sid: string;
  caller: string | null;
  channel: string;
  outcome: string | null;
  started_at: string | null;
  created_at: string;
  duration_sec: number;
  gemini_connect_ms: number | null;
  in_chunks: number;
  in_bytes: string | number;
  out_frames: number;
  out_bytes: string | number;
  in_proc_avg_ms: number | null;
  in_proc_p95_ms: number | null;
  out_proc_avg_ms: number | null;
  out_proc_p95_ms: number | null;
  turn_count: number;
  turn_avg_ms: number | null;
  turn_p95_ms: number | null;
  interrupts: number;
  tools: Record<string, { count?: number; avg?: number; min?: number; max?: number; p50?: number; p95?: number; failed?: number }> | null;
}

function mapCallMetricRow(row: CallMetricRow): CallMetric {
  const tools: Record<string, ToolMetric> = {};
  for (const [name, t] of Object.entries(row.tools ?? {})) {
    tools[name] = {
      count: Number(t?.count ?? 0),
      avg: Number(t?.avg ?? 0),
      min: num(t?.min) ?? undefined,
      max: num(t?.max) ?? undefined,
      p50: num(t?.p50) ?? undefined,
      p95: Number(t?.p95 ?? 0),
      failed: Number(t?.failed ?? 0),
    };
  }
  return {
    callId: row.call_id,
    callSid: row.call_sid,
    caller: row.caller,
    channel: row.channel,
    outcome: row.outcome,
    startedAt: row.started_at,
    createdAt: row.created_at,
    durationSec: Number(row.duration_sec ?? 0),
    geminiConnectMs: num(row.gemini_connect_ms),
    inChunks: Number(row.in_chunks ?? 0),
    inBytes: Number(row.in_bytes ?? 0),
    outFrames: Number(row.out_frames ?? 0),
    outBytes: Number(row.out_bytes ?? 0),
    inProcAvgMs: num(row.in_proc_avg_ms),
    inProcP95Ms: num(row.in_proc_p95_ms),
    outProcAvgMs: num(row.out_proc_avg_ms),
    outProcP95Ms: num(row.out_proc_p95_ms),
    turnCount: Number(row.turn_count ?? 0),
    turnAvgMs: num(row.turn_avg_ms),
    turnP95Ms: num(row.turn_p95_ms),
    interrupts: Number(row.interrupts ?? 0),
    tools,
  };
}

/** Most recent per-call metrics, joined with the call for caller/start time. */
export async function getCallMetrics(limit = 100): Promise<CallMetric[]> {
  const rows = await query<CallMetricRow>(
    `select m.call_id, m.call_sid, c.caller, m.channel, m.outcome, c.started_at, m.created_at,
            m.duration_sec, m.gemini_connect_ms, m.in_chunks, m.in_bytes, m.out_frames, m.out_bytes,
            m.in_proc_avg_ms, m.in_proc_p95_ms, m.out_proc_avg_ms, m.out_proc_p95_ms,
            m.turn_count, m.turn_avg_ms, m.turn_p95_ms, m.interrupts, m.tools
       from call_metrics m
       join calls c on c.id = m.call_id
      order by m.created_at desc
      limit $1`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map(mapCallMetricRow);
}

/** Platform-wide rollup across all stored call metrics. */
export async function getCallMetricsSummary(): Promise<CallMetricsSummary> {
  const row = await queryOne<{
    samples: string;
    avg_duration: number | null;
    avg_gemini_connect: number | null;
    avg_in_proc: number | null;
    avg_out_proc: number | null;
    avg_turn: number | null;
    p50_turn: number | null;
    p95_turn: number | null;
    worst_turn_p95: number | null;
    total_interrupts: string | null;
    total_in_bytes: string | null;
    total_out_bytes: string | null;
  }>(`
    select
      count(*) as samples,
      avg(duration_sec) as avg_duration,
      avg(gemini_connect_ms) as avg_gemini_connect,
      avg(in_proc_avg_ms) as avg_in_proc,
      avg(out_proc_avg_ms) as avg_out_proc,
      avg(turn_avg_ms) as avg_turn,
      percentile_cont(0.5) within group (order by turn_avg_ms) as p50_turn,
      percentile_cont(0.95) within group (order by turn_avg_ms) as p95_turn,
      max(turn_p95_ms) as worst_turn_p95,
      sum(interrupts) as total_interrupts,
      sum(in_bytes) as total_in_bytes,
      sum(out_bytes) as total_out_bytes
    from call_metrics
  `);

  return {
    samples: Number(row?.samples ?? 0),
    avgDurationSec: round(num(row?.avg_duration)),
    avgGeminiConnectMs: round(num(row?.avg_gemini_connect), 0),
    avgInProcMs: round(num(row?.avg_in_proc), 2),
    avgOutProcMs: round(num(row?.avg_out_proc), 2),
    avgTurnMs: round(num(row?.avg_turn), 0),
    p50TurnMs: round(num(row?.p50_turn), 0),
    p95TurnMs: round(num(row?.p95_turn), 0),
    worstTurnP95Ms: round(num(row?.worst_turn_p95), 0),
    totalInterrupts: Number(row?.total_interrupts ?? 0),
    totalInBytes: Number(row?.total_in_bytes ?? 0),
    totalOutBytes: Number(row?.total_out_bytes ?? 0),
  };
}
