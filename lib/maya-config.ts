/**
 * maya-config.ts
 *
 * Single source of truth for:
 *   - Maya's system instruction (persona, knowledge base, company profile)
 *   - The bookAppointment tool declaration
 *
 * This file has ZERO browser/React dependencies and can be imported from:
 *   - Browser: components/LiveReceptionist.tsx
 *   - Node.js server: server.mjs (Exotel ↔ Gemini Live bridge)
 */

import { FunctionDeclaration, Tool, Type } from '@google/genai';
import { CompanyProfile } from '../types';

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

export const bookAppointmentDeclaration: FunctionDeclaration = {
  name: 'bookAppointment',
  parameters: {
    type: Type.OBJECT,
    description: 'Book an appointment for a customer.',
    properties: {
      customerName: {
        type: Type.STRING,
        description: 'Name of the customer',
      },
      date: {
        type: Type.STRING,
        description: 'Date of appointment (YYYY-MM-DD)',
      },
      time: {
        type: Type.STRING,
        description: 'Time of appointment (HH:MM)',
      },
      reason: {
        type: Type.STRING,
        description: 'Reason for appointment (optional)',
      },
    },
    required: ['customerName', 'date', 'time'],
  },
};

/**
 * Returns the Gemini Live `tools` array containing all function declarations.
 * Identical to the `tools` useMemo in LiveReceptionist.tsx.
 */

export const searchKnowledgeBaseDeclaration: FunctionDeclaration = {
  name: 'searchKnowledgeBase',
  parameters: {
    type: Type.OBJECT,
    description: 'Search the company knowledge base for answers to user questions.',
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query to find relevant knowledge',
      },
    },
    required: ['query'],
  },
};

export function buildTools(): Tool[] {
  return [{ functionDeclarations: [bookAppointmentDeclaration, searchKnowledgeBaseDeclaration] }];
}

// ---------------------------------------------------------------------------
// System instruction builder
// ---------------------------------------------------------------------------

export interface MayaVoiceSettings {
  /** Prebuilt voice name, e.g. 'Kore', 'Zephyr', 'Puck' */
  voiceName?: string;
  /** 'Low' | 'Normal' | 'High' — injected as text instruction */
  pitch?: string;
  /** 'Slow' | 'Normal' | 'Fast' — injected as text instruction */
  speed?: string;
}

const DEFAULT_VOICE_SETTINGS: Required<MayaVoiceSettings> = {
  voiceName: 'Aoede',
  pitch: 'Normal',
  speed: 'Normal',
};

/**
 * Builds the full system instruction string for Maya.
 *
 * @param companyProfile  Company details injected into the persona.
 * @param knowledgeItems  Knowledge base documents to inject.
 * @param voiceSettings   Optional voice/pitch/speed overrides.
 *
 * @returns A string suitable for `config.systemInstruction` in ai.live.connect().
 */
export function buildSystemInstruction(
  companyProfile: CompanyProfile,
  voiceSettings: MayaVoiceSettings = {},
): string {
  const { pitch, speed } = {
    ...DEFAULT_VOICE_SETTINGS,
    ...voiceSettings,
  };

  const profileInstruction = `
COMPANY DETAILS:
- Name: ${companyProfile.name || 'The Company'}
- Industry: ${companyProfile.industry || 'General'}
- Description: ${companyProfile.description || 'A business in Kerala'}
- Address: ${companyProfile.address || 'Kerala'}
- Contact: ${companyProfile.contactPhone || 'Not provided'} / ${companyProfile.contactEmail || 'Not provided'}
`.trim();

  const voiceStyleInstruction = `
7. VOICE SETTINGS: The user has requested a specific speaking style.
     - Pitch: ${pitch}
     - Speed: ${speed}
     - Maintain this persona consistently while speaking Malayalam or English.
`.trim();

  const baseInstruction = `You are Maya, a warm, professional, and efficient AI receptionist for ${companyProfile.name || 'us'}, located in ${companyProfile.address || 'Kerala'}.
1. LANGUAGE: You MUST speak Malayalam fluently. You can also speak English if the user prefers, or mix them (Manglish) for a natural Kerala business feel.
2. ROLE: Answer customer queries about the business, services, menu, etc. based on the Company Details and by searching the knowledge base.
3. BOOKING: If a user wants to book an appointment/table, ask for their Name, Date, and Time, then use the 'bookAppointment' tool.
4. TONE: Be polite, welcoming, and speak at a natural, unhurried pace, like a helpful human receptionist. Use phrases like "Namaskaram" (Hello), "Endha vishayam?" (What is the matter?), "Sheri" (Okay).
5. CONTEXT: You are representing ${companyProfile.name || 'the business'}. Always refer to the company as "we" or "us".
6. KNOWLEDGE BASE: Whenever a caller asks about services, pricing, process, policies, or other business details, call 'searchKnowledgeBase' before answering. Use only the returned content and company details; never guess. If the answer is not found, politely say you do not have that information and offer to take a message.

${profileInstruction}

${voiceStyleInstruction}`;

  return baseInstruction;
}

export function buildGreeting(companyProfile: CompanyProfile): string {
  return `Thank you for calling ${companyProfile.name || 'our company'}. This is Maya, how can I help you today?`;
}

// ---------------------------------------------------------------------------
// Default empty profile (used by phone bridge when nothing is configured)
// ---------------------------------------------------------------------------

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: '',
  industry: '',
  description: '',
  contactEmail: '',
  contactPhone: '',
  address: '',
};
