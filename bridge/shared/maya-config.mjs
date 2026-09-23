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
            description:
              'Book an appointment/table for a customer. Use only after collecting name, date and time.',
            properties: {
              customerName: { type: 'STRING', description: 'Name of the customer' },
              phone: { type: 'STRING', description: 'Caller phone number (optional)' },
              date: { type: 'STRING', description: 'Date of appointment (YYYY-MM-DD)' },
              time: { type: 'STRING', description: 'Time of appointment (HH:MM)' },
              reason: { type: 'STRING', description: 'Reason for appointment (optional)' },
            },
            required: ['customerName', 'date', 'time'],
          },
        },
        {
          name: 'requestCallback',
          parameters: {
            type: 'OBJECT',
            description:
              'Register a request for someone from the team to call the customer back later. Use when the caller asks to be called back or wants to speak to a human.',
            properties: {
              customerName: { type: 'STRING', description: 'Name of the customer' },
              phone: { type: 'STRING', description: 'Phone number to call back (optional)' },
              preferredTime: { type: 'STRING', description: 'Preferred time to be called (optional)' },
              reason: { type: 'STRING', description: 'Why they want a callback (optional)' },
            },
            required: ['customerName'],
          },
        },
        {
          name: 'captureQuoteRequest',
          parameters: {
            type: 'OBJECT',
            description:
              'Capture a quote/pricing request. Use when the caller asks about pricing, a quote, or an estimate for work or a project.',
            properties: {
              customerName: { type: 'STRING', description: 'Name of the customer' },
              phone: { type: 'STRING', description: 'Phone number (optional)' },
              projectType: { type: 'STRING', description: 'Type of project/service (optional)' },
              details: { type: 'STRING', description: 'Details about what they need (optional)' },
              timeline: { type: 'STRING', description: 'When they need it (optional)' },
            },
            required: ['customerName'],
          },
        },
        {
          name: 'takeMessage',
          parameters: {
            type: 'OBJECT',
            description:
              'Take a general message for the team. Use as a catch-all when the query is not a booking, callback or quote request, or when the caller wants to leave information.',
            properties: {
              customerName: { type: 'STRING', description: 'Name of the customer' },
              phone: { type: 'STRING', description: 'Phone number (optional)' },
              message: { type: 'STRING', description: 'The message to pass on' },
            },
            required: ['customerName', 'message'],
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

export const DEFAULT_VOICE_SETTINGS = {
  voiceName: 'Aoede',
  pitch: 'Normal',
  speed: 'Normal',
};

/**
 * Resolves the phone-call voice settings from the environment, falling back to
 * the canonical defaults above. Single source of truth for phone voice config.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ voiceName: string, pitch: string, speed: string }}
 */
export function resolveVoiceSettings(env = process.env) {
  return {
    voiceName: env.MAYA_VOICE || DEFAULT_VOICE_SETTINGS.voiceName,
    pitch: env.MAYA_PITCH || DEFAULT_VOICE_SETTINGS.pitch,
    speed: env.MAYA_SPEED || DEFAULT_VOICE_SETTINGS.speed,
  };
}

/**
 * Whether the bridge should have Maya speak an opening greeting.
 *
 * Set MAYA_GREETING=0|false|off|no|disabled to disable it — useful when an
 * Exotel greeting/IVR applet already greets the caller. Default: enabled.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isGreetingEnabled(env = process.env) {
  const raw = String(env.MAYA_GREETING ?? '').trim().toLowerCase();
  if (raw === '') return true;
  return !['0', 'false', 'off', 'no', 'disabled'].includes(raw);
}

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
}

/**
 * @param {object} companyProfile
 * @returns {string}
 */
export function buildGreeting(companyProfile) {
  return `Thank you for calling ${companyProfile.name || 'our company'}. This is Maya, how can I help you today?`;
}
