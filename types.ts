export interface KnowledgeItem {
  id: string;
  type: 'text' | 'link' | 'pdf' | 'image' | 'doc' | 'instruction';
  title: string;
  content: string; // For simulation, we assume extracted text is here
  dateAdded: Date;
  fileName?: string;
  /** Active state for `instruction` items. Ignored for normal knowledge. */
  isActive?: boolean;
}

export type VoiceName = 'Aoede' | 'Kore' | 'Zephyr' | 'Puck' | 'Fenrir' | 'Charon';
export type VoicePitch = 'Low' | 'Normal' | 'High';
export type VoiceSpeed = 'Slow' | 'Normal' | 'Fast';

export interface VoiceOption {
  id: VoiceName;
  label: string;
  gender: 'Female' | 'Male';
  desc: string;
}

/** Gemini Live prebuilt voices available to the assistant. */
export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'Aoede', label: 'Aoede', gender: 'Female', desc: 'Warm & Professional' },
  { id: 'Kore', label: 'Kore', gender: 'Female', desc: 'Calm & Professional' },
  { id: 'Zephyr', label: 'Zephyr', gender: 'Female', desc: 'Friendly & Warm' },
  { id: 'Puck', label: 'Puck', gender: 'Male', desc: 'Deep & Steady' },
  { id: 'Fenrir', label: 'Fenrir', gender: 'Male', desc: 'Authoritative' },
  { id: 'Charon', label: 'Charon', gender: 'Male', desc: 'Deep & Resonant' },
];

export const VOICE_PITCHES: VoicePitch[] = ['Low', 'Normal', 'High'];
export const VOICE_SPEEDS: VoiceSpeed[] = ['Slow', 'Normal', 'Fast'];

export interface CompanyProfile {
  /**
   * Name of the business/organisation the assistant represents. For a personal
   * assistant setup this can be the owner's name. Never assume a specific person.
   */
  name: string;
  industry: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  /** Dashboard-controlled agent voice settings (optional for backwards compat). */
  voiceName?: VoiceName;
  voicePitch?: VoicePitch;
  voiceSpeed?: VoiceSpeed;
  /** Whether the bridge has the assistant speak an opening greeting. */
  greetingEnabled?: boolean;
  /** Custom opening line; when empty the default greeting is used. */
  greetingText?: string | null;
  /**
   * How the assistant introduces itself (e.g. "Ava"). Empty means the assistant
   * describes itself generically ("the AI assistant"). No personal name is
   * hardcoded anywhere.
   */
  assistantName?: string;
  /**
   * Preferred spoken language(s), free text (e.g. "Malayalam and English").
   * Empty means "match whatever language the caller uses".
   */
  assistantLanguage?: string;
  /** Extra owner-approved facts the assistant may share with callers. */
  additionalInfo?: string;
  /** Allow the assistant to end the call once the caller is clearly finished. */
  endCallEnabled?: boolean;
}

export interface Appointment {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  date: string;
  time: string;
  reason?: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  /** Call that produced this booking, when booked by the assistant. */
  callSid?: string;
  createdAt?: string;
}

export type CallOutcome =
  | 'booked'
  | 'answered'
  | 'escalated'
  | 'missed'
  | 'abandoned'
  | 'in-progress';

export interface TranscriptTurn {
  /** Speaker of a transcript turn. 'assistant' never implies a specific person. */
  role: 'caller' | 'assistant';
  text: string;
  at: string;
}

export interface CallRecord {
  id: string;
  callSid: string;
  caller: string;
  phone?: string;
  channel: 'phone' | 'browser';
  startedAt: string;
  endedAt?: string;
  durationSec: number;
  outcome: CallOutcome;
  intent?: string;
  summary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  transcript: TranscriptTurn[];
  bookingIds: string[];
  knowledgeQueries: string[];
}

export interface KnowledgeChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  /** Set when the assistant turn created a knowledge item. */
  createdItemId?: string;
}

/**
 * A person the agent has spoken with. Mirrored into the CRM when one is
 * configured. Kept here (not in lib/store) so client components can import it
 * without pulling the server-only Postgres module into the browser bundle.
 */
export interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string;
  crmProvider: string | null;
  crmId: string | null;
  lastContactAt: string | null;
}

export interface CrmStatus {
  provider: string;
  description: string;
  configured: boolean;
}

export interface BookingSettings {
  openTime: string;
  closeTime: string;
  slotMinutes: number;
  openDays: number[];
  horizonDays: number;
}

export interface DashboardMetrics {
  totalCalls: number;
  answered: number;
  booked: number;
  escalated: number;
  missed: number;
  avgDurationSec: number;
  knowledgeItems: number;
  appointments: number;
  confirmedAppointments: number;
  knowledgeLookups: number;
}

/** Per-tool latency stats recorded for a call. */
export interface ToolMetric {
  count: number;
  avg: number;
  min?: number;
  max?: number;
  p50?: number;
  p95: number;
  failed: number;
}

/** Aggregated latency/throughput metrics for one completed call. */
export interface CallMetric {
  callId: string;
  callSid: string;
  caller: string | null;
  channel: string;
  outcome: string | null;
  startedAt: string | null;
  createdAt: string;
  durationSec: number;
  geminiConnectMs: number | null;
  inChunks: number;
  inBytes: number;
  outFrames: number;
  outBytes: number;
  inProcAvgMs: number | null;
  inProcP95Ms: number | null;
  outProcAvgMs: number | null;
  outProcP95Ms: number | null;
  turnCount: number;
  turnAvgMs: number | null;
  turnP95Ms: number | null;
  interrupts: number;
  tools: Record<string, ToolMetric>;
}

/** Platform-wide rollup over all stored call metrics. */
export interface CallMetricsSummary {
  samples: number;
  avgDurationSec: number | null;
  avgGeminiConnectMs: number | null;
  avgInProcMs: number | null;
  avgOutProcMs: number | null;
  avgTurnMs: number | null;
  p50TurnMs: number | null;
  p95TurnMs: number | null;
  worstTurnP95Ms: number | null;
  totalInterrupts: number;
  totalInBytes: number;
  totalOutBytes: number;
}

export interface CallbackRequest {
  id: string;
  callSid: string | null;
  customerName: string;
  phone: string | null;
  preferredTime: string | null;
  reason: string | null;
  status: string;
  createdAt: string;
}

export interface QuoteRequest {
  id: string;
  callSid: string | null;
  customerName: string;
  phone: string | null;
  projectType: string | null;
  details: string | null;
  timeline: string | null;
  status: string;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  callSid: string | null;
  customerName: string;
  phone: string | null;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface CallLogRow {
  id: string;
  callSid: string;
  callerNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  summary: string | null;
  transcript: TranscriptTurn[] | null;
  createdAt: string;
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE',
  CALENDAR = 'CALENDAR',
  LIVE_RECEPTIONIST = 'LIVE_RECEPTIONIST',
}
