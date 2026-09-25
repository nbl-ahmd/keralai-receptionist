/**
 * store.ts
 *
 * Postgres (Neon) data layer for the receptionist platform.
 *
 * Every tenant-owned function takes an explicit `tenantId` first argument and
 * constrains its SQL by `tenant_id`. There is no hidden/global tenant context:
 * a caller must have a resolved, trusted tenant before touching data.
 *
 * Search uses pgvector cosine distance. Embeddings are 3072-dimensional, which
 * exceeds pgvector's 2000-dimension index limit, so similarity runs as an exact
 * scan. That is fast for typical knowledge bases (hundreds of chunks); move to a
 * halfvec index if you ever exceed that.
 */

import {
  Appointment,
  CallMetric,
  CallMetricsSummary,
  CallLogRow,
  CallOutcome,
  CallRecord,
  CallbackRequest,
  CompanyProfile,
  Contact,
  DashboardMetrics,
  KnowledgeItem,
  MessageRow,
  QuoteRequest,
  ToolMetric,
  TranscriptTurn,
  VOICE_OPTIONS,
  VoiceName,
  VoicePitch,
  VoiceSpeed,
} from "../types";
import { query, queryOne } from "@/db/client";
import { getTenantGeminiClient, getTenantEmbeddingModel } from "./gemini";

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
  voiceName: "Aoede",
  voicePitch: "Normal",
  voiceSpeed: "Normal",
  greetingEnabled: true,
  greetingText: null,
  assistantName: "",
  assistantLanguage: "",
  additionalInfo: "",
  endCallEnabled: true,
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

/** Embeds text with the tenant's own Gemini credential/model. */
export async function embedText(tenantId: string, text: string): Promise<number[]> {
  const [ai, model] = await Promise.all([
    getTenantGeminiClient(tenantId),
    getTenantEmbeddingModel(tenantId),
  ]);
  const response = await ai.models.embedContent({ model, contents: text });
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
  assistant_name: string | null;
  assistant_language: string | null;
  additional_info: string | null;
  end_call_enabled: boolean | null;
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
    name: String(input.name ?? "").slice(0, 200),
    industry: String(input.industry ?? "").slice(0, 200),
    description: String(input.description ?? "").slice(0, 2000),
    address: String(input.address ?? input.location ?? "").slice(0, 300),
    contactEmail: String(input.contactEmail ?? input.email ?? "").slice(0, 200),
    contactPhone: String(input.contactPhone ?? input.phone ?? "").slice(0, 50),
    voiceName: normalizeVoiceName(input.voiceName),
    voicePitch: normalizePitch(input.voicePitch),
    voiceSpeed: normalizeSpeed(input.voiceSpeed),
    // Default on unless explicitly disabled.
    greetingEnabled: input.greetingEnabled === undefined ? true : Boolean(input.greetingEnabled),
    greetingText: greetingText && greetingText.trim() ? greetingText : null,
    assistantName: String(input.assistantName ?? "").slice(0, 80),
    assistantLanguage: String(input.assistantLanguage ?? "").slice(0, 200),
    additionalInfo: String(input.additionalInfo ?? "").slice(0, 4000),
    endCallEnabled: input.endCallEnabled === undefined ? true : Boolean(input.endCallEnabled),
  };
}

const PROFILE_SELECT = `
  select name, industry, description, address, contact_email, contact_phone,
         voice_name, voice_pitch, voice_speed, greeting_enabled, greeting_text,
         assistant_name, assistant_language, additional_info, end_call_enabled
    from company_profile where tenant_id = $1`;

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
    assistantName: row.assistant_name ?? "",
    assistantLanguage: row.assistant_language ?? "",
    additionalInfo: row.additional_info ?? "",
    endCallEnabled: row.end_call_enabled ?? true,
  };
}

export async function getProfile(tenantId: string): Promise<CompanyProfile> {
  try {
    const row = await queryOne<ProfileRow>(PROFILE_SELECT, [tenantId]);
    return row ? mapProfileRow(row) : { ...EMPTY_PROFILE };
  } catch (error) {
    // Pre-003 schema (voice setting columns absent): fall back to base columns.
    console.warn("[store] voice setting columns missing, run migrations:", error instanceof Error ? error.message : error);
    const row = await queryOne<ProfileRow>(
      `select name, industry, description, address, contact_email, contact_phone
         from company_profile where tenant_id = $1`,
      [tenantId],
    );
    return row ? mapProfileRow(row) : { ...EMPTY_PROFILE };
  }
}

export async function saveProfile(tenantId: string, profile: CompanyProfile): Promise<CompanyProfile> {
  const normalised = normalizeProfile(profile as unknown as Record<string, unknown>);
  await query(
    `insert into company_profile (
       tenant_id, name, industry, description, address, contact_email, contact_phone,
       voice_name, voice_pitch, voice_speed, greeting_enabled, greeting_text,
       assistant_name, assistant_language, additional_info, end_call_enabled, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
     on conflict (tenant_id) do update set
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
       assistant_name = excluded.assistant_name,
       assistant_language = excluded.assistant_language,
       additional_info = excluded.additional_info,
       end_call_enabled = excluded.end_call_enabled,
       updated_at = now()`,
    [
      tenantId,
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
      normalised.assistantName,
      normalised.assistantLanguage,
      normalised.additionalInfo,
      normalised.endCallEnabled,
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
  is_active: boolean;
}

function mapKnowledgeRow(row: KnowledgeRow): KnowledgeItem {
  return {
    id: row.id,
    type: row.type as KnowledgeItem["type"],
    title: row.title,
    content: row.content,
    fileName: row.file_name ?? undefined,
    dateAdded: new Date(toIso(row.date_added)),
    isActive: row.is_active,
  };
}

/** All knowledge items for a tenant. Instruction rows are included; callers may filter. */
export async function getKnowledge(tenantId: string): Promise<KnowledgeItem[]> {
  const rows = await query<KnowledgeRow>(
    `select id, type, title, content, file_name, date_added, is_active
       from knowledge_items where tenant_id = $1 order by date_added desc`,
    [tenantId],
  );
  return rows.map(mapKnowledgeRow);
}

/** Normal knowledge only (never instruction rows). Used by the voice RAG path. */
export async function getKnowledgeForSearch(tenantId: string): Promise<KnowledgeItem[]> {
  const rows = await query<KnowledgeRow>(
    `select id, type, title, content, file_name, date_added, is_active
       from knowledge_items
      where tenant_id = $1 and type <> 'instruction'
      order by date_added desc`,
    [tenantId],
  );
  return rows.map(mapKnowledgeRow);
}

export async function getKnowledgeItem(tenantId: string, id: string): Promise<KnowledgeItem | null> {
  if (!isUuid(id)) return null;
  const row = await queryOne<KnowledgeRow>(
    `select id, type, title, content, file_name, date_added, is_active
       from knowledge_items where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );
  return row ? mapKnowledgeRow(row) : null;
}

/** Inserts or updates a tenant knowledge item, returning its (possibly generated) id. */
export async function upsertKnowledgeItem(tenantId: string, item: KnowledgeItem): Promise<KnowledgeItem> {
  const id = isUuid(item.id) ? item.id : crypto.randomUUID();
  // `is_active` only has behavioural meaning for instructions; normal knowledge
  // always stores true. New instructions default to active.
  const isActive = item.type === "instruction" ? item.isActive !== false : true;
  const rows = await query<KnowledgeRow>(
    `insert into knowledge_items (id, tenant_id, type, title, content, file_name, date_added, is_active, updated_at)
     values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8, now())
     on conflict (id) do update set
       type = excluded.type,
       title = excluded.title,
       content = excluded.content,
       file_name = excluded.file_name,
       is_active = excluded.is_active,
       updated_at = now()
     where knowledge_items.tenant_id = excluded.tenant_id
     returning id, type, title, content, file_name, date_added, is_active`,
    [id, tenantId, item.type, item.title, item.content, item.fileName ?? null, item.dateAdded ?? null, isActive],
  );
  if (!rows[0]) throw new Error("Knowledge item not found for this workspace");
  return mapKnowledgeRow(rows[0]);
}

/**
 * Replaces all embeddings for an item with freshly chunked vectors, using the
 * tenant's Gemini credential.
 *
 * Instructions are never embedded: the item's existing embeddings are removed
 * first (defense-in-depth in case an item was previously stored as text), then
 * indexing stops. Normal knowledge keeps the existing embedding pipeline.
 */
export async function reindexKnowledgeItem(tenantId: string, item: KnowledgeItem): Promise<KnowledgeEmbedding[]> {
  await query(`delete from knowledge_embeddings where item_id = $1 and tenant_id = $2`, [item.id, tenantId]);

  if (item.type === "instruction") {
    return [];
  }

  const chunks = chunkText(`--- ${item.title} ---\n${item.content}`);
  const fresh: KnowledgeEmbedding[] = [];

  for (const [chunkIndex, text] of chunks.entries()) {
    const values = await embedText(tenantId, text);
    await query(
      `insert into knowledge_embeddings (item_id, tenant_id, chunk_index, chunk_text, embedding)
       values ($1, $2, $3, $4, $5::vector)`,
      [item.id, tenantId, chunkIndex, text, toVector(values)],
    );
    fresh.push({ itemId: item.id, chunkIndex, text, values });
  }

  return fresh;
}

export async function removeKnowledgeItem(tenantId: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  // Embeddings cascade via the foreign key.
  await query(`delete from knowledge_items where id = $1 and tenant_id = $2`, [id, tenantId]);
}

export async function getEmbeddings(tenantId: string): Promise<KnowledgeEmbedding[]> {
  const rows = await query<{
    item_id: string;
    chunk_index: number;
    chunk_text: string;
    embedding: string;
  }>(
    `select item_id, chunk_index, chunk_text, embedding::text as embedding
       from knowledge_embeddings where tenant_id = $1 order by item_id, chunk_index`,
    [tenantId],
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
  tenantId: string,
  queryText: string,
  limit = 3,
): Promise<KnowledgeSearchResult[]> {
  const vector = await embedText(tenantId, queryText);
  const rows = await query<{ chunk_text: string; item_id: string; score: number }>(
    `select e.chunk_text,
            e.item_id,
            1 - (e.embedding <=> $2::vector) as score
       from knowledge_embeddings e
       where e.tenant_id = $1
       order by e.embedding <=> $2::vector
       limit $3`,
    [tenantId, toVector(vector), limit],
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

export async function getContacts(tenantId: string): Promise<Contact[]> {
  const rows = await query<ContactRow>(
    `select id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at
       from contacts where tenant_id = $1 order by coalesce(last_contact_at, created_at) desc`,
    [tenantId],
  );
  return rows.map(mapContactRow);
}

/**
 * Finds a contact by phone/email or creates one, then stamps last_contact_at.
 * This is the identity anchor that calls and appointments hang off.
 */
export async function upsertContact(
  tenantId: string,
  input: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    company?: string | null;
    source?: string;
  },
): Promise<Contact> {
  const phone = input.phone?.trim() || null;
  const email = input.email?.trim() || null;

  let existing: ContactRow | null = null;
  if (phone || email) {
    existing = await queryOne<ContactRow>(
      `select id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at
         from contacts
        where tenant_id = $3
          and (($1::text is not null and phone = $1)
            or ($2::text is not null and email = $2))
        order by created_at
        limit 1`,
      [phone, email, tenantId],
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
       where id = $1 and tenant_id = $6
       returning id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at`,
      [existing.id, input.name ?? null, phone, email, input.company ?? null, tenantId],
    );
    return mapContactRow(rows[0]);
  }

  const rows = await query<ContactRow>(
    `insert into contacts (tenant_id, name, phone, email, company, source, last_contact_at)
     values ($1, $2, $3, $4, $5, $6, now())
     returning id, name, phone, email, company, source, crm_provider, crm_id, last_contact_at`,
    [tenantId, input.name ?? null, phone, email, input.company ?? null, input.source ?? "call"],
  );
  return mapContactRow(rows[0]);
}

export async function updateContactCrmLink(
  tenantId: string,
  contactId: string,
  provider: string,
  crmId: string,
): Promise<void> {
  if (!isUuid(contactId)) return;
  await query(
    `update contacts set crm_provider = $3, crm_id = $4, updated_at = now()
      where id = $1 and tenant_id = $2`,
    [contactId, tenantId, provider, crmId],
  );
}

export async function logCrmSyncEvent(
  tenantId: string,
  event: {
    contactId: string;
    provider: string;
    direction?: "push" | "pull";
    status: "success" | "failed" | "skipped";
    payload?: unknown;
    error?: string;
  },
): Promise<void> {
  if (!isUuid(event.contactId)) return;
  await query(
    `insert into crm_sync_events (tenant_id, contact_id, provider, direction, status, payload, error)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      tenantId,
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
    left join calls c on c.id = a.call_id and c.tenant_id = a.tenant_id`;

export async function getAppointments(tenantId: string): Promise<Appointment[]> {
  const rows = await query<AppointmentRow>(
    `${APPOINTMENT_SELECT} where a.tenant_id = $1 order by a.date asc, a.time asc`,
    [tenantId],
  );
  return rows.map(mapAppointmentRow);
}

export async function getAppointmentsForCall(tenantId: string, callId: string): Promise<Appointment[]> {
  if (!isUuid(callId)) return [];
  const rows = await query<AppointmentRow>(
    `${APPOINTMENT_SELECT} where a.tenant_id = $1 and a.call_id = $2 order by a.date asc, a.time asc`,
    [tenantId, callId],
  );
  return rows.map(mapAppointmentRow);
}

export async function addAppointment(tenantId: string, appointment: Appointment): Promise<Appointment> {
  const id = isUuid(appointment.id) ? appointment.id : crypto.randomUUID();

  // Link to the originating call (and contact) when the call is known.
  let callId: string | null = null;
  if (appointment.callSid) {
    const call = await queryOne<{ id: string }>(
      `select id from calls where call_sid = $1 and tenant_id = $2`,
      [appointment.callSid, tenantId],
    );
    callId = call?.id ?? null;
  }

  const rows = await query<AppointmentRow>(
    `insert into appointments (id, tenant_id, call_id, customer_name, customer_phone, customer_email, date, time, reason, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, coalesce($11::timestamptz, now()))
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
     where appointments.tenant_id = excluded.tenant_id
     returning id, customer_name, customer_phone, customer_email,
               to_char(date, 'YYYY-MM-DD') as date, time, reason, status, created_at,
               (select call_sid from calls where calls.id = appointments.call_id and calls.tenant_id = appointments.tenant_id) as call_sid`,
    [
      id,
      tenantId,
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
  if (!rows[0]) throw new Error("Appointment not found for this workspace");
  return mapAppointmentRow(rows[0]);
}

export async function updateAppointmentStatus(
  tenantId: string,
  id: string,
  status: Appointment["status"],
): Promise<Appointment | null> {
  if (!isUuid(id)) return null;
  const rows = await query<AppointmentRow>(
    `update appointments set status = $3, updated_at = now()
      where id = $1 and tenant_id = $2
     returning id, customer_name, customer_phone, customer_email,
               to_char(date, 'YYYY-MM-DD') as date, time, reason, status, created_at,
               (select call_sid from calls where calls.id = appointments.call_id and calls.tenant_id = appointments.tenant_id) as call_sid`,
    [id, tenantId, status],
  );
  return rows[0] ? mapAppointmentRow(rows[0]) : null;
}

export async function removeAppointment(tenantId: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await query(`delete from appointments where id = $1 and tenant_id = $2`, [id, tenantId]);
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
        from call_transcript_turns where call_id = c.id and tenant_id = c.tenant_id
    ) t on true
    left join lateral (
      select json_agg(query order by id) as queries
        from call_knowledge_queries where call_id = c.id and tenant_id = c.tenant_id
    ) k on true
    left join lateral (
      select json_agg(id::text) as ids from appointments where call_id = c.id and tenant_id = c.tenant_id
    ) a on true`;

export async function getCalls(tenantId: string): Promise<CallRecord[]> {
  const rows = await query<CallRow>(`${CALL_SELECT} where c.tenant_id = $1 order by c.started_at desc`, [
    tenantId,
  ]);
  return rows.map(mapCallRow);
}

export async function getCallBySid(tenantId: string, callSid: string): Promise<CallRecord | null> {
  const rows = await query<CallRow>(`${CALL_SELECT} where c.tenant_id = $1 and c.call_sid = $2`, [
    tenantId,
    callSid,
  ]);
  return rows[0] ? mapCallRow(rows[0]) : null;
}

/**
 * Inserts or updates a call by (tenant_id, call_sid), replacing its transcript
 * and knowledge-query rows. Contacts are upserted from the caller identity.
 */
export async function upsertCall(tenantId: string, call: CallRecord): Promise<CallRecord> {
  const contact = await upsertContact(tenantId, {
    name: call.caller && call.caller !== "Unknown caller" ? call.caller : null,
    phone: call.phone ?? null,
    source: call.channel === "phone" ? "phone" : "web",
  });

  const rows = await query<{ id: string }>(
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
  await query(`delete from call_transcript_turns where call_id = $1 and tenant_id = $2`, [
    callId,
    tenantId,
  ]);
  const turns = call.transcript ?? [];
  if (turns.length > 0) {
    const values: unknown[] = [];
    const placeholders = turns
      .map((turn, index) => {
        values.push(callId, tenantId, index, turn.role, turn.text, turn.at);
        const base = index * 6;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::timestamptz)`;
      })
      .join(", ");
    await query(
      `insert into call_transcript_turns (call_id, tenant_id, seq, role, content, at) values ${placeholders}`,
      values,
    );
  }

  // Replace knowledge queries
  await query(`delete from call_knowledge_queries where call_id = $1 and tenant_id = $2`, [
    callId,
    tenantId,
  ]);
  const queries = call.knowledgeQueries ?? [];
  if (queries.length > 0) {
    const values: unknown[] = [];
    const placeholders = queries
      .map((q, index) => {
        values.push(callId, tenantId, q);
        const base = index * 3;
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(", ");
    await query(
      `insert into call_knowledge_queries (call_id, tenant_id, query) values ${placeholders}`,
      values,
    );
  }

  const saved = await getCallBySid(tenantId, call.callSid);
  if (!saved) throw new Error("Failed to load saved call");
  return saved;
}

export async function removeCall(tenantId: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await query(`delete from calls where id = $1 and tenant_id = $2`, [id, tenantId]);
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export async function getMetrics(tenantId: string): Promise<DashboardMetrics> {
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
  }>(
    `
    select
      (select count(*) from calls where tenant_id = $1) as total_calls,
      (select count(*) from calls where tenant_id = $1 and outcome not in ('missed','abandoned')) as answered,
      (select count(*) from calls where tenant_id = $1 and outcome = 'booked') as booked,
      (select count(*) from calls where tenant_id = $1 and outcome = 'escalated') as escalated,
      (select count(*) from calls where tenant_id = $1 and outcome = 'missed') as missed,
      (select avg(duration_sec) from calls where tenant_id = $1) as avg_duration,
      (select count(*) from knowledge_items where tenant_id = $1) as knowledge_items,
      (select count(*) from appointments where tenant_id = $1) as appointments,
      (select count(*) from appointments where tenant_id = $1 and status = 'confirmed') as confirmed_appointments,
      (select count(*) from call_knowledge_queries where tenant_id = $1) as knowledge_lookups
  `,
    [tenantId],
  );

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
export async function getCallMetrics(tenantId: string, limit = 100): Promise<CallMetric[]> {
  const rows = await query<CallMetricRow>(
    `select m.call_id, m.call_sid, c.caller, m.channel, m.outcome, c.started_at, m.created_at,
            m.duration_sec, m.gemini_connect_ms, m.in_chunks, m.in_bytes, m.out_frames, m.out_bytes,
            m.in_proc_avg_ms, m.in_proc_p95_ms, m.out_proc_avg_ms, m.out_proc_p95_ms,
            m.turn_count, m.turn_avg_ms, m.turn_p95_ms, m.interrupts, m.tools
       from call_metrics m
       join calls c on c.id = m.call_id and c.tenant_id = m.tenant_id
      where m.tenant_id = $1
      order by m.created_at desc
      limit $2`,
    [tenantId, Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map(mapCallMetricRow);
}

/** Tenant rollup across stored call metrics. */
export async function getCallMetricsSummary(tenantId: string): Promise<CallMetricsSummary> {
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
  }>(
    `
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
    where tenant_id = $1
  `,
    [tenantId],
  );

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

// ---------------------------------------------------------------------------
// Call actions: callback requests, quote requests, messages, call log
// ---------------------------------------------------------------------------

const clampLimit = (limit: number) => Math.min(Math.max(Math.trunc(limit) || 100, 1), 500);

export async function getCallbackRequests(tenantId: string, limit = 100): Promise<CallbackRequest[]> {
  const rows = await query<{
    id: string;
    call_sid: string | null;
    customer_name: string;
    phone: string | null;
    preferred_time: string | null;
    reason: string | null;
    status: string;
    created_at: unknown;
  }>(
    `select cr.id, c.call_sid, cr.customer_name, cr.phone, cr.preferred_time, cr.reason, cr.status, cr.created_at
       from callback_requests cr
       left join calls c on c.id = cr.call_id and c.tenant_id = cr.tenant_id
      where cr.tenant_id = $1
      order by cr.created_at desc
      limit $2`,
    [tenantId, clampLimit(limit)],
  );
  return rows.map((row) => ({
    id: row.id,
    callSid: row.call_sid,
    customerName: row.customer_name,
    phone: row.phone,
    preferredTime: row.preferred_time,
    reason: row.reason,
    status: row.status,
    createdAt: toIso(row.created_at),
  }));
}

export async function updateCallbackStatus(tenantId: string, id: string, status: string): Promise<void> {
  if (!isUuid(id)) return;
  await query(
    `update callback_requests set status = $3, updated_at = now() where id = $1 and tenant_id = $2`,
    [id, tenantId, status],
  );
}

export async function getQuoteRequests(tenantId: string, limit = 100): Promise<QuoteRequest[]> {
  const rows = await query<{
    id: string;
    call_sid: string | null;
    customer_name: string;
    phone: string | null;
    project_type: string | null;
    details: string | null;
    timeline: string | null;
    status: string;
    created_at: unknown;
  }>(
    `select qr.id, c.call_sid, qr.customer_name, qr.phone, qr.project_type, qr.details, qr.timeline, qr.status, qr.created_at
       from quote_requests qr
       left join calls c on c.id = qr.call_id and c.tenant_id = qr.tenant_id
      where qr.tenant_id = $1
      order by qr.created_at desc
      limit $2`,
    [tenantId, clampLimit(limit)],
  );
  return rows.map((row) => ({
    id: row.id,
    callSid: row.call_sid,
    customerName: row.customer_name,
    phone: row.phone,
    projectType: row.project_type,
    details: row.details,
    timeline: row.timeline,
    status: row.status,
    createdAt: toIso(row.created_at),
  }));
}

export async function updateQuoteStatus(tenantId: string, id: string, status: string): Promise<void> {
  if (!isUuid(id)) return;
  await query(
    `update quote_requests set status = $3, updated_at = now() where id = $1 and tenant_id = $2`,
    [id, tenantId, status],
  );
}

export async function getMessages(tenantId: string, limit = 100): Promise<MessageRow[]> {
  const rows = await query<{
    id: string;
    call_sid: string | null;
    customer_name: string;
    phone: string | null;
    message: string;
    read: boolean;
    created_at: unknown;
  }>(
    `select m.id, c.call_sid, m.customer_name, m.phone, m.message, m.read, m.created_at
       from messages m
       left join calls c on c.id = m.call_id and c.tenant_id = m.tenant_id
      where m.tenant_id = $1
      order by m.created_at desc
      limit $2`,
    [tenantId, clampLimit(limit)],
  );
  return rows.map((row) => ({
    id: row.id,
    callSid: row.call_sid,
    customerName: row.customer_name,
    phone: row.phone,
    message: row.message,
    read: Boolean(row.read),
    createdAt: toIso(row.created_at),
  }));
}

export async function markMessageRead(tenantId: string, id: string, read = true): Promise<void> {
  if (!isUuid(id)) return;
  await query(`update messages set read = $3 where id = $1 and tenant_id = $2`, [id, tenantId, read]);
}

export async function getCallLog(tenantId: string, limit = 100): Promise<CallLogRow[]> {
  const rows = await query<{
    id: string;
    call_sid: string;
    caller_number: string | null;
    started_at: unknown;
    ended_at: unknown;
    summary: string | null;
    transcript: TranscriptTurn[] | null;
    created_at: unknown;
  }>(
    `select id, call_sid, caller_number, started_at, ended_at, summary, transcript, created_at
       from call_log where tenant_id = $1 order by created_at desc limit $2`,
    [tenantId, clampLimit(limit)],
  );
  return rows.map((row) => ({
    id: row.id,
    callSid: row.call_sid,
    callerNumber: row.caller_number,
    startedAt: row.started_at ? toIso(row.started_at) : null,
    endedAt: row.ended_at ? toIso(row.ended_at) : null,
    summary: row.summary,
    transcript: row.transcript ?? null,
    createdAt: toIso(row.created_at),
  }));
}
