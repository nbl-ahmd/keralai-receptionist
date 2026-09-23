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
    description:
      'Book an appointment/table for a customer. Use only after collecting name, date and time.',
    properties: {
      customerName: { type: Type.STRING, description: 'Name of the customer' },
      phone: { type: Type.STRING, description: 'Caller phone number (optional)' },
      date: { type: Type.STRING, description: 'Date of appointment (YYYY-MM-DD)' },
      time: { type: Type.STRING, description: 'Time of appointment (HH:MM)' },
      reason: { type: Type.STRING, description: 'Reason for appointment (optional)' },
    },
    required: ['customerName', 'date', 'time'],
  },
};

export const requestCallbackDeclaration: FunctionDeclaration = {
  name: 'requestCallback',
  parameters: {
    type: Type.OBJECT,
    description:
      'Register a request for someone from the team to call the customer back later. Use when the caller asks to be called back or wants to speak to a human.',
    properties: {
      customerName: { type: Type.STRING, description: 'Name of the customer' },
      phone: { type: Type.STRING, description: 'Phone number to call back (optional)' },
      preferredTime: { type: Type.STRING, description: 'Preferred time to be called (optional)' },
      reason: { type: Type.STRING, description: 'Why they want a callback (optional)' },
    },
    required: ['customerName'],
  },
};

export const captureQuoteRequestDeclaration: FunctionDeclaration = {
  name: 'captureQuoteRequest',
  parameters: {
    type: Type.OBJECT,
    description:
      'Capture a quote/pricing request. Use when the caller asks about pricing, a quote, or an estimate for work or a project.',
    properties: {
      customerName: { type: Type.STRING, description: 'Name of the customer' },
      phone: { type: Type.STRING, description: 'Phone number (optional)' },
      projectType: { type: Type.STRING, description: 'Type of project/service (optional)' },
      details: { type: Type.STRING, description: 'Details about what they need (optional)' },
      timeline: { type: Type.STRING, description: 'When they need it (optional)' },
    },
    required: ['customerName'],
  },
};

export const takeMessageDeclaration: FunctionDeclaration = {
  name: 'takeMessage',
  parameters: {
    type: Type.OBJECT,
    description:
      'Take a general message for the team. Use as a catch-all when the query is not a booking, callback or quote request, or when the caller wants to leave information.',
    properties: {
      customerName: { type: Type.STRING, description: 'Name of the customer' },
      phone: { type: Type.STRING, description: 'Phone number (optional)' },
      message: { type: Type.STRING, description: 'The message to pass on' },
    },
    required: ['customerName', 'message'],
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
  return [
    {
      functionDeclarations: [
        bookAppointmentDeclaration,
        requestCallbackDeclaration,
        captureQuoteRequestDeclaration,
        takeMessageDeclaration,
        searchKnowledgeBaseDeclaration,
      ],
    },
  ];
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
3. TONE: Be polite, welcoming, and speak at a natural, unhurried pace, like a helpful human receptionist. Use phrases like "Namaskaram" (Hello), "Endha vishayam?" (What is the matter?), "Sheri" (Okay).
4. CONTEXT: You are representing ${companyProfile.name || 'the business'}. Always refer to the company as "we" or "us".
5. KNOWLEDGE BASE: Call 'searchKnowledgeBase' when the caller asks about services, process, policies, or business details. Do NOT use it for greetings, goodbyes, basic conversational replies (e.g. "yes", "okay", "thank you"), or information already in this prompt. Use only the returned content; never guess. If the answer is not found, politely say you do not have that information and offer to take a message.
6. TAKE ACTION WITH TOOLS — choose exactly one action for the caller's intent:
   - Wants to book / reserve / schedule an appointment or table → collect Name, Date, Time, then call 'bookAppointment'.
   - Wants a phone call back / to speak to a person → call 'requestCallback' (ask for name and a preferred time).
   - Asks about pricing / a quote / an estimate → answer from the knowledge base if you can, and call 'captureQuoteRequest' to log the request.
   - Anything else that needs follow-up, or the caller wants to leave information → call 'takeMessage'.
   - Simple questions answerable from the knowledge base or this prompt → just answer; no tool needed.
   Always collect at least the caller's name before calling an action tool. Include the phone number when the caller provides it.
7. NEVER CONFIRM WITHOUT SUCCESS: Only tell the caller an action is done AFTER the tool returns a successful result. If a tool returns an error or failure, apologise, say you could not complete it right now, and offer to try again or take a message. Never say "booked", "noted", "requested" or similar unless the tool actually succeeded.

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
