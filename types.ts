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
  date: string;
  time: string;
  reason?: string;
  status: 'confirmed' | 'pending' | 'cancelled';
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  KNOWLEDGE_BASE = 'KNOWLEDGE_BASE',
  CALENDAR = 'CALENDAR',
  LIVE_RECEPTIONIST = 'LIVE_RECEPTIONIST',
}
