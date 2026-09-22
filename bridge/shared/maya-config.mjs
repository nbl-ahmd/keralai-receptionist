/**
 * bridge/shared/maya-config.mjs
 *
 * Plain ESM (no TypeScript, no Next.js) version of lib/maya-config.ts.
 * This is the source of truth for the bridge process.
 *
 * lib/maya-config.ts remains the TypeScript source for the Next.js dashboard.
 * Keep both in sync when changing Maya's persona, tools, or voice settings.
 *
 * Exports:
 *   buildSystemInstruction(companyProfile, voiceSettings?)
 *   buildTools()
 *   buildGreeting(companyProfile)
 */

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

/** @returns {object[]} Gemini Live tools array */
export function buildTools() {
  return [
    {
      functionDeclarations: [
        {
          name: 'bookAppointment',
          parameters: {
            type: 'OBJECT',
            description: 'Book an appointment for a customer.',
            properties: {
              customerName: { type: 'STRING', description: 'Name of the customer' },
              date: { type: 'STRING', description: 'Date of appointment (YYYY-MM-DD)' },
              time: { type: 'STRING', description: 'Time of appointment (HH:MM)' },
              reason: { type: 'STRING', description: 'Reason for appointment (optional)' },
            },
            required: ['customerName', 'date', 'time'],
          },
        },
        {
          name: 'searchKnowledgeBase',
          parameters: {
            type: 'OBJECT',
            description: 'Search the company knowledge base for answers to user questions.',
            properties: {
              query: { type: 'STRING', description: 'The search query to find relevant knowledge' },
            },
            required: ['query'],
          },
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// System instruction builder
// ---------------------------------------------------------------------------

const DEFAULT_VOICE_SETTINGS = {
  voiceName: 'Aoede',
  pitch: 'Normal',
  speed: 'Normal',
};

/**
 * Builds the full system instruction string for Maya.
 *
 * @param {object} companyProfile  Company details (name, industry, description, address, contactPhone, contactEmail)
 * @param {{ voiceName?: string, pitch?: string, speed?: string }} [voiceSettings]
 * @returns {string}
 */
export function buildSystemInstruction(companyProfile, voiceSettings = {}) {
  const { pitch, speed } = { ...DEFAULT_VOICE_SETTINGS, ...voiceSettings };

  const profileInstruction = [
    'COMPANY DETAILS:',
    `- Name: ${companyProfile.name || 'The Company'}`,
    `- Industry: ${companyProfile.industry || 'General'}`,
    `- Description: ${companyProfile.description || 'A business in Kerala'}`,
    `- Address: ${companyProfile.address || 'Kerala'}`,
    `- Contact: ${companyProfile.contactPhone || 'Not provided'} / ${companyProfile.contactEmail || 'Not provided'}`,
  ].join('\n');

  const voiceStyleInstruction = [
    '7. VOICE SETTINGS: The user has requested a specific speaking style.',
    `     - Pitch: ${pitch}`,
    `     - Speed: ${speed}`,
    '     - Maintain this persona consistently while speaking Malayalam or English.',
  ].join('\n');

  return `You are Maya, a warm, professional, and efficient AI receptionist for ${companyProfile.name || 'us'}, located in ${companyProfile.address || 'Kerala'}.
1. LANGUAGE: You MUST speak Malayalam fluently. You can also speak English if the user prefers, or mix them (Manglish) for a natural Kerala business feel.
2. ROLE: Answer customer queries about the business, services, menu, etc. based on the Company Details and by searching the knowledge base.
3. BOOKING: If a user wants to book an appointment/table, ask for their Name, Date, and Time, then use the 'bookAppointment' tool.
4. TONE: Be polite, welcoming, and speak at a natural, unhurried pace, like a helpful human receptionist. Use phrases like "Namaskaram" (Hello), "Endha vishayam?" (What is the matter?), "Sheri" (Okay).
5. CONTEXT: You are representing ${companyProfile.name || 'the business'}. Always refer to the company as "we" or "us".
6. KNOWLEDGE BASE: Call 'searchKnowledgeBase' only when a caller explicitly asks about services, pricing, process, policies, or specific business details. DO NOT use this tool for greetings, goodbyes, basic conversational interactions (e.g., "yes", "okay", "thank you"), or information already in this prompt. Use only the returned content; never guess. If the answer is not found, politely say you do not have that information and offer to take a message.

${profileInstruction}

${voiceStyleInstruction}`;
}

/**
 * @param {object} companyProfile
 * @returns {string}
 */
export function buildGreeting(companyProfile) {
  return `Thank you for calling ${companyProfile.name || 'our company'}. This is Maya, how can I help you today?`;
}
