export interface KnowledgeItem {
  id: string;
  type: 'text' | 'link' | 'pdf' | 'image' | 'doc';
  title: string;
  content: string; // For simulation, we assume extracted text is here
  dateAdded: Date;
  fileName?: string;
}

export interface CompanyProfile {
  name: string;
  industry: string;
  description: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
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
  /** Call that produced this booking, when booked by Maya. */
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
  role: 'caller' | 'maya';
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

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE',
  CALENDAR = 'CALENDAR',
  LIVE_RECEPTIONIST = 'LIVE_RECEPTIONIST',
}
