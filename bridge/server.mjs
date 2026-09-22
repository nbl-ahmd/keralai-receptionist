/**
 * server.mjs
 *
 * KeralaI Receptionist
 *
 * Next.js custom server + Exotel <-> Gemini Live WebSocket bridge.
 *
 * Main improvements:
 *   - Gemini 3.8 Live for low-latency native audio
 *   - Non-blocking Gemini function calling
 *   - KB search executes asynchronously
 *   - CRM synchronization never blocks voice responses
 *   - Appointment confirmation is returned as soon as DB persistence finishes
 *   - Safer Gemini session lifecycle
 *   - Idempotent/debounced Exotel clear on Gemini interruption
 *   - Reduced unnecessary audio buffering
 *   - Per-call latency instrumentation
 *   - Tool lifecycle protection after call termination
 *
 * Required env vars:
 *   GEMINI_API_KEY
 *   DATABASE_URL
 *
 * Optional env vars:
 *   PORT
 *   EXOTEL_SAMPLE_RATE       8000 or 16000, default 8000
 *   MAYA_VOICE               default Aoede
 *   MAYA_PITCH               default Normal
 *   MAYA_SPEED               default Normal
 *   PUBLIC_APP_ORIGIN
 *   MAYA_COMPANY_JSON
 *
 * Optional tuning:
 *   EXOTEL_CHUNK_MS          default 100
 *   BARGE_IN_DEBOUNCE_MS     default 350
 *   TOOL_TIMEOUT_MS          default 12000
 *   KB_RESULT_COUNT          default 3
 *   BROWSER_MAX_SESSIONS_PER_IP default 3
 *   BROWSER_SESSION_TTL_MS   default 15 minutes
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';
import next from 'next';
import { GoogleGenAI, Modality } from '@google/genai';

import {
  closePool,
  loadCompanyProfile,
  logCrmSyncEvent,
  persistAppointment,
  searchKnowledgeEmbeddings,
  upsertCallRecord,
} from './db.mjs';

import {
  getCrmProvider,
  syncToCrm,
} from './crm.mjs';

import { BrowserSession } from './browser-session.mjs';


// ─────────────────────────────────────────────────────────────────────────────
// Environment loading
// ─────────────────────────────────────────────────────────────────────────────

{
  const envFiles = ['.env.local', '.env'];
  const dir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );

  for (const file of envFiles) {
    const envPath = path.join(dir, file);

    if (!fs.existsSync(envPath)) continue;

    const lines = fs.readFileSync(envPath, 'utf8').split('\n');

    for (const raw of lines) {
      const line = raw.trim();

      if (!line || line.startsWith('#')) continue;

      const eqIdx = line.indexOf('=');

      if (eqIdx === -1) continue;

      const key = line.slice(0, eqIdx).trim();

      let val = line.slice(eqIdx + 1).trim();

      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }

    console.log(`[bridge] Loaded env from ${file}`);
    break;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gemini Live model.
 *
 * Gemini 3.8 Live is Google's current low-latency native-audio Live model.
 */
const GEMINI_MODEL =
  process.env.GEMINI_LIVE_MODEL ?? 'gemini-3.8-live';

/**
 * Gemini audio requirements.
 */
const GEMINI_INPUT_SAMPLE_RATE = 16000;
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;

/**
 * Exotel sample rate.
 */
const EXOTEL_SAMPLE_RATE = parseInt(
  process.env.EXOTEL_SAMPLE_RATE ?? '8000',
  10,
);

/**
 * Output packet duration.
 *
 * 100 ms is a good starting point for phone audio.
 */
const EXOTEL_CHUNK_MS = Math.max(
  20,
  Number(process.env.EXOTEL_CHUNK_MS ?? 100),
);

const EXOTEL_CHUNK_BYTES = Math.round(
  EXOTEL_SAMPLE_RATE *
  2 *
  (EXOTEL_CHUNK_MS / 1000),
);

/**
 * Barge-in debounce.
 *
 * Gemini can emit interruption-related events close together.
 */
const BARGE_IN_DEBOUNCE_MS = Math.max(
  100,
  Number(process.env.BARGE_IN_DEBOUNCE_MS ?? 350),
);

/**
 * Tool timeout.
 *
 * Prevents an external service from keeping a tool alive indefinitely.
 */
const TOOL_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.TOOL_TIMEOUT_MS ?? 12000),
);

/**
 * Number of KB results returned to Gemini.
 */
const KB_RESULT_COUNT = Math.max(
  1,
  Number(process.env.KB_RESULT_COUNT ?? 3),
);


// ─────────────────────────────────────────────────────────────────────────────
// Shared prompt/tool logic
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemInstruction(companyProfile, voiceSettings = {}) {
  const pitch = voiceSettings.pitch ?? 'Normal';
  const speed = voiceSettings.speed ?? 'Normal';

  const profileInstruction = `
COMPANY DETAILS:
- Name: ${companyProfile.name || 'The Company'}
- Industry: ${companyProfile.industry || 'General'}
- Description: ${companyProfile.description || 'A business in Kerala'}
- Address: ${companyProfile.address || 'Kerala'}
- Contact: ${companyProfile.contactPhone || 'Not provided'} / ${companyProfile.contactEmail || 'Not provided'}
`.trim();

  return `
You are Maya, a professional, warm and intelligent AI receptionist for ${
    companyProfile.name || 'our company'
  }.

LANGUAGE:
- Your primary language is Malayalam.
- You are equally fluent in English.
- Seamlessly match the caller's language.
- If the caller mixes Malayalam and English, respond naturally in the same style.

VOICE:
- Speak naturally and conversationally.
- Keep responses concise.
- Avoid long explanations.
- Do not use markdown formatting.
- Do not read bullet points literally.
- Sound like a helpful human receptionist.

VOICE SETTINGS:
- Pitch: ${pitch}
- Speed: ${speed}

${profileInstruction}

CORE RESPONSIBILITIES:

1. GENERAL CONVERSATION
Handle greetings, acknowledgements, simple conversational questions and
questions that can be answered directly from the company details above
without using a tool.

2. KNOWLEDGE BASE
Use searchKnowledgeBase when the caller asks for company-specific
information that is NOT already explicitly available in the company
details or the current conversation.

Examples that normally require the knowledge base:
- Services
- Pricing
- Products
- Features
- Service availability
- E-commerce development
- Website development
- Technical services
- Company policies
- Detailed business information

Do NOT call the knowledge base for:
- Greetings
- "Can you hear me?"
- "Are you there?"
- Simple acknowledgements
- Casual conversation
- Information already available in COMPANY DETAILS
- Information already established earlier in the conversation

Never invent company-specific information.

3. APPOINTMENTS
When the caller wants to book an appointment:
- Ask for their name if not known.
- Ask for preferred date if not known.
- Ask for preferred time if not known.
- Ask for the reason when useful, but do not unnecessarily block booking
  if the reason is optional.
- Once name, date and time are available, use bookAppointment.

Never claim that an appointment is booked unless bookAppointment succeeds.

4. TOOL RESULTS
When a tool result is returned, incorporate it naturally into the
conversation.

Do not mention:
- tools
- APIs
- databases
- embeddings
- function calls
- internal systems

5. PHONE CONVERSATION
Prefer short responses.

For example:
Instead of:
"Certainly. I would be happy to provide you with comprehensive
information regarding our services..."

Say:
"Sure. We provide web development and AI solutions. What would you like
to know?"

6. INTERRUPTION
If the caller starts speaking while you are talking, stop naturally and
listen to the caller.

7. UNKNOWN INFORMATION
If the knowledge base does not contain the answer, say that you do not
have that information rather than guessing.
`.trim();
}


/**
 * Gemini Live tool definitions.
 *
 * Both tools are intentionally NON_BLOCKING.
 *
 * This allows the voice session to remain interactive while our Node
 * process performs DB/API work.
 */
function buildTools() {
  return [
    {
      functionDeclarations: [
        {
          name: 'bookAppointment',
          behavior: 'NON_BLOCKING',
          description:
            'Book an appointment for a customer after the customer has provided their name, date and time.',
          parameters: {
            type: 'OBJECT',
            properties: {
              customerName: {
                type: 'STRING',
                description: 'Name of the customer',
              },
              date: {
                type: 'STRING',
                description: 'Date of appointment in YYYY-MM-DD format',
              },
              time: {
                type: 'STRING',
                description: 'Time of appointment in HH:MM format',
              },
              reason: {
                type: 'STRING',
                description: 'Reason for appointment, if provided',
              },
            },
            required: [
              'customerName',
              'date',
              'time',
            ],
          },
        },

        {
          name: 'searchKnowledgeBase',
          behavior: 'NON_BLOCKING',
          description:
            'Search the company knowledge base for company-specific information that is not already known from the conversation or company profile.',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: {
                type: 'STRING',
                description:
                  'A concise semantic search query describing the information the caller wants.',
              },
            },
            required: ['query'],
          },
        },
      ],
    },
  ];
}


// ─────────────────────────────────────────────────────────────────────────────
// Audio utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Linear interpolation PCM16 resampler.
 *
 * Input:
 *   PCM16 little-endian mono
 *
 * Used for:
 *   Exotel 8/16 kHz -> Gemini 16 kHz
 *   Gemini 24 kHz -> Exotel 8/16 kHz
 */
function resamplePcm16(input, inRate, outRate) {
  if (!input || input.length === 0) {
    return Buffer.alloc(0);
  }

  if (inRate === outRate) {
    return input;
  }

  const inSamples = Math.floor(input.length / 2);

  if (inSamples <= 0) {
    return Buffer.alloc(0);
  }

  const ratio = inRate / outRate;

  const outSamples = Math.max(
    1,
    Math.round(inSamples / ratio),
  );

  const out = Buffer.allocUnsafe(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * ratio;

    const srcIdx = Math.floor(srcPos);

    const frac = srcPos - srcIdx;

    const i0 = Math.min(
      Math.max(srcIdx, 0),
      inSamples - 1,
    );

    const i1 = Math.min(
      Math.max(srcIdx + 1, 0),
      inSamples - 1,
    );

    const s0 = input.readInt16LE(i0 * 2);
    const s1 = input.readInt16LE(i1 * 2);

    const sample = Math.round(
      s0 + frac * (s1 - s0),
    );

    out.writeInt16LE(
      Math.max(
        -32768,
        Math.min(32767, sample),
      ),
      i * 2,
    );
  }

  return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowMs() {
  return Date.now();
}


/**
 * Run a promise with a timeout.
 */
async function withTimeout(promise, timeoutMs, label = 'operation') {
  let timeoutId;

  try {
    return await Promise.race([
      promise,

      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(
              `${label} timed out after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}


/**
 * Safely execute a background task without producing an unhandled
 * rejection.
 */
function runBackground(label, task) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(
        `[bridge][background:${label}]`,
        error,
      );
    });
}


// ─────────────────────────────────────────────────────────────────────────────
// Call session
// ─────────────────────────────────────────────────────────────────────────────

class CallSession {
  constructor(
    callSid,
    streamSid,
    exotelWs,
    ai,
    companyProfile,
  ) {
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.exotelWs = exotelWs;
    this.ai = ai;
    this.companyProfile = companyProfile;

    /**
     * Gemini Live session.
     */
    this.geminiSession = null;

    /**
     * Promise used during session initialization.
     *
     * This prevents the onopen callback from racing the assignment of
     * this.geminiSession.
     */
    this.geminiSessionPromise = null;

    /**
     * Prevents simultaneous session initialization.
     */
    this.openingGemini = false;

    /**
     * Audio output buffer.
     */
    this.outputBuffer = Buffer.alloc(0);

    /**
     * Call lifecycle.
     */
    this.closed = false;
    this.closing = false;

    /**
     * Prevent duplicate stop/cleanup operations.
     */
    this.cleanupPromise = null;

    /**
     * Tool tracking.
     */
    this.pendingTools = new Map();

    /**
     * Barge-in state.
     */
    this.lastInterruptAt = 0;
    this.clearSentAt = 0;

    /**
     * Timing instrumentation.
     */
    this.startedAtMs = nowMs();
    this.firstExotelAudioAtMs = null;
    this.firstGeminiAudioAtMs = null;
    this.lastCallerAudioAtMs = null;
    this.lastGeminiAudioAtMs = null;

    /**
     * Call reporting.
     */
    this.startedAt = new Date().toISOString();

    this.transcript = [];

    this.bookingIds = [];

    this.knowledgeQueries = [];

    this.outcome = 'answered';

    this.intent = null;

    this.caller = 'Unknown caller';

    this.phone = null;

    this.callRecordId = `call-${callSid}`;
  }

  log(...args) {
    console.log(
      `[bridge][${this.callSid}]`,
      ...args,
    );
  }

  err(...args) {
    console.error(
      `[bridge][${this.callSid}]`,
      ...args,
    );
  }

  /**
   * True when Gemini can safely receive/send messages.
   */
  isGeminiUsable() {
    return (
      !this.closed &&
      !this.closing &&
      !!this.geminiSession
    );
  }

  /**
   * Append transcript turn and merge consecutive turns from the same
   * speaker.
   */
  addTranscript(role, text) {
    if (!text || !text.trim()) {
      return;
    }

    const clean = text.trim();

    const last =
      this.transcript[this.transcript.length - 1];

    if (last && last.role === role) {
      last.text = `${last.text} ${clean}`.trim();
      return;
    }

    this.transcript.push({
      role,
      text: clean,
      at: new Date().toISOString(),
    });
  }

  /**
   * Log latency information.
   */
  logLatency(label, startedAt, extra = '') {
    if (!startedAt) return;

    const elapsed = nowMs() - startedAt;

    this.log(
      `⏱ ${label}: ${elapsed}ms${extra ? ` ${extra}` : ''}`,
    );
  }

  /**
   * Build persisted call record.
   */
  buildCallRecord() {
    const endedAt = new Date().toISOString();

    const durationSec = Math.max(
      0,
      Math.round(
        (
          new Date(endedAt).getTime() -
          new Date(this.startedAt).getTime()
        ) / 1000,
      ),
    );

    return {
      id: this.callRecordId,
      callSid: this.callSid,
      caller: this.caller,
      phone: this.phone,
      channel: 'phone',
      startedAt: this.startedAt,
      endedAt,
      durationSec,
      outcome: this.outcome,
      intent: this.intent,

      summary: this.transcript.length
        ? this.transcript
            .slice(0, 4)
            .map(
              (turn) =>
                `${
                  turn.role === 'caller'
                    ? 'Caller'
                    : 'Maya'
                }: ${turn.text}`,
            )
            .join(' ')
        : null,

      sentiment: 'neutral',

      transcript: this.transcript,

      bookingIds: this.bookingIds,

      knowledgeQueries: this.knowledgeQueries,
    };
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Gemini
  // ──────────────────────────────────────────────────────────────────────────

  async openGeminiSession() {
    if (this.closed || this.closing) {
      throw new Error(
        'Cannot open Gemini session for closed call',
      );
    }

    if (this.geminiSession) {
      return this.geminiSession;
    }

    if (this.openingGemini && this.geminiSessionPromise) {
      return this.geminiSessionPromise;
    }

    this.openingGemini = true;

    const voiceName =
      process.env.MAYA_VOICE ?? 'Aoede';

    const pitch =
      process.env.MAYA_PITCH ?? 'Normal';

    const speed =
      process.env.MAYA_SPEED ?? 'Normal';

    const systemInstruction =
      buildSystemInstruction(
        this.companyProfile,
        {
          pitch,
          speed,
        },
      );

    this.log(
      `Connecting to Gemini Live (model: ${GEMINI_MODEL}, voice: ${voiceName})`,
    );

    const connectStartedAt = nowMs();

    let sessionPromise;

    sessionPromise = this.ai.live.connect({
      model: GEMINI_MODEL,

      config: {
        responseModalities: [
          Modality.AUDIO,
        ],

        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName,
            },
          },
        },

        systemInstruction,

        tools: buildTools(),

        inputAudioTranscription: {},

        outputAudioTranscription: {},
      },

      callbacks: {
        onopen: () => {
          this.log(
            'Gemini Live session opened',
          );

          this.logLatency(
            'Gemini connection',
            connectStartedAt,
          );

          /**
           * Do not access this.geminiSession here.
           *
           * sessionPromise is the actual session object and avoids the
           * initialization race.
           */
          sessionPromise
            .then((session) => {
              if (
                this.closed ||
                this.closing
              ) {
                return;
              }

              const greeting =
                buildGreeting(
                  this.companyProfile,
                );

              try {
                session.sendClientContent({
                  turns: [
                    {
                      role: 'user',
                      parts: [
                        {
                          text:
                            `System command: Greet the caller naturally with: "${greeting}"`,
                        },
                      ],
                    },
                  ],
                  turnComplete: true,
                });
              } catch (error) {
                this.err(
                  'Failed to send greeting command:',
                  error,
                );
              }
            })
            .catch((error) => {
              this.err(
                'Greeting initialization failed:',
                error,
              );
            });
        },

        onmessage: (message) => {
          if (
            this.closed ||
            this.closing
          ) {
            return;
          }

          /**
           * Important:
           *
           * Do NOT await this from the WebSocket callback.
           *
           * Tool calls may perform DB/API operations. The Live message
           * stream must remain responsive.
           */
          void this._handleGeminiMessage(
            message,
          ).catch((error) => {
            this.err(
              'Error in Gemini message handler:',
              error,
            );
          });
        },

        onerror: (error) => {
          this.err(
            'Gemini Live error:',
            error,
          );
        },

        onclose: (evt) => {
          this.log(
            'Gemini Live session closed',
            evt?.code,
            evt?.reason,
          );

          if (
            this.geminiSession &&
            !this.closing
          ) {
            this.geminiSession = null;
          }
        },
      },
    });

    this.geminiSessionPromise =
      sessionPromise;

    try {
      this.geminiSession =
        await sessionPromise;

      this.log(
        'Gemini Live session ready',
      );

      return this.geminiSession;
    } finally {
      this.openingGemini = false;
    }
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Exotel audio -> Gemini
  // ──────────────────────────────────────────────────────────────────────────

  handleExotelMedia(base64Payload) {
    if (
      this.closed ||
      this.closing ||
      !this.geminiSession
    ) {
      return;
    }

    try {
      const rawExotel =
        Buffer.from(
          base64Payload,
          'base64',
        );

      if (!rawExotel.length) {
        return;
      }

      const rawGemini =
        EXOTEL_SAMPLE_RATE ===
        GEMINI_INPUT_SAMPLE_RATE
          ? rawExotel
          : resamplePcm16(
              rawExotel,
              EXOTEL_SAMPLE_RATE,
              GEMINI_INPUT_SAMPLE_RATE,
            );

      this.lastCallerAudioAtMs =
        nowMs();

      this.geminiSession.sendRealtimeInput(
        {
          media: {
            data:
              rawGemini.toString(
                'base64',
              ),

            mimeType:
              `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
          },
        },
      );
    } catch (error) {
      this.err(
        'Error processing Exotel media:',
        error,
      );
    }
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Gemini messages
  // ──────────────────────────────────────────────────────────────────────────

  async _handleGeminiMessage(message) {
    if (
      this.closed ||
      this.closing
    ) {
      return;
    }

    const serverContent =
      message?.serverContent;

    // ────────────────────────────────────────────────────────────────────────
    // Transcriptions
    // ────────────────────────────────────────────────────────────────────────

    const inputTranscript =
      serverContent
        ?.inputTranscription
        ?.text;

    if (inputTranscript) {
      this.addTranscript(
        'caller',
        inputTranscript,
      );
    }

    const outputTranscript =
      serverContent
        ?.outputTranscription
        ?.text;

    if (outputTranscript) {
      this.addTranscript(
        'maya',
        outputTranscript,
      );
    }


    // ────────────────────────────────────────────────────────────────────────
    // Tool calls
    // ────────────────────────────────────────────────────────────────────────

    if (message?.toolCall) {
      const functionCalls =
        message.toolCall
          .functionCalls ?? [];

      this.log(
        `Tool call received: ${functionCalls
          .map((fc) => fc.name)
          .join(', ')}`,
      );

      /**
       * Start each tool independently.
       *
       * The Gemini Live message handler itself is not blocked by DB/API
       * latency.
       */
      for (const fc of functionCalls) {
        void this._executeToolCall(fc);
      }
    }


    // ────────────────────────────────────────────────────────────────────────
    // Audio
    // ────────────────────────────────────────────────────────────────────────

    const parts =
      serverContent
        ?.modelTurn
        ?.parts ?? [];

    /**
     * Process ALL parts rather than assuming audio is always part [0].
     */
    for (const part of parts) {
      const base64Audio =
        part?.inlineData?.data;

      if (!base64Audio) {
        continue;
      }

      this._handleGeminiAudio(
        base64Audio,
      );
    }


    // ────────────────────────────────────────────────────────────────────────
    // Barge-in
    // ────────────────────────────────────────────────────────────────────────

    if (serverContent?.interrupted) {
      this._handleBargeIn();
    }
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Tool execution
  // ──────────────────────────────────────────────────────────────────────────

  async _executeToolCall(fc) {
    if (
      !fc ||
      !fc.id ||
      !fc.name
    ) {
      return;
    }

    if (
      this.closed ||
      this.closing
    ) {
      return;
    }

    if (
      this.pendingTools.has(fc.id)
    ) {
      this.log(
        `Duplicate tool call ignored: ${fc.id}`,
      );
      return;
    }

    const startedAt = nowMs();

    const task = {
      id: fc.id,
      name: fc.name,
      startedAt,
    };

    this.pendingTools.set(
      fc.id,
      task,
    );

    try {
      if (
        fc.name ===
        'searchKnowledgeBase'
      ) {
        await this._executeKnowledgeSearch(
          fc,
          startedAt,
        );
      } else if (
        fc.name ===
        'bookAppointment'
      ) {
        await this._executeBookAppointment(
          fc,
          startedAt,
        );
      } else {
        this.log(
          `Unknown tool call: ${fc.name}`,
        );

        this._sendToolResponse(
          fc,
          {
            result:
              'The requested operation is not available.',
          },
          'WHEN_IDLE',
        );
      }
    } catch (error) {
      this.err(
        `Tool ${fc.name} failed:`,
        error,
      );

      if (
        this.isGeminiUsable()
      ) {
        this._sendToolResponse(
          fc,
          {
            result:
              'The requested operation could not be completed. Please try again.',
          },
          'WHEN_IDLE',
        );
      }
    } finally {
      this.pendingTools.delete(
        fc.id,
      );
    }
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Knowledge base
  // ──────────────────────────────────────────────────────────────────────────

  async _executeKnowledgeSearch(
    fc,
    startedAt,
  ) {
    const args = fc.args ?? {};

    const query =
      typeof args.query === 'string'
        ? args.query.trim()
        : '';

    if (!query) {
      this._sendToolResponse(
        fc,
        {
          result: [],
        },
        'WHEN_IDLE',
      );

      return;
    }

    this.knowledgeQueries.push(
      query,
    );

    if (!this.intent) {
      this.intent = query;
    }

    this.log(
      `KB search: "${query}"`,
    );

    const embeddingStartedAt =
      nowMs();

    let result = [];

    try {
      const response =
        await withTimeout(
          this.ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: query,
          }),
          TOOL_TIMEOUT_MS,
          'KB embedding',
        );

      const queryVector =
        response
          ?.embeddings?.[0]
          ?.values;

      this.logLatency(
        'KB embedding',
        embeddingStartedAt,
      );

      if (
        queryVector &&
        queryVector.length
      ) {
        const dbStartedAt =
          nowMs();

        result =
          await withTimeout(
            searchKnowledgeEmbeddings(
              `[${queryVector.join(',')}]`,
              KB_RESULT_COUNT,
            ),
            TOOL_TIMEOUT_MS,
            'KB vector search',
          );

        this.logLatency(
          'KB vector search',
          dbStartedAt,
          `results=${Array.isArray(result) ? result.length : 0}`,
        );
      }
    } catch (error) {
      this.err(
        'Error searching knowledge base:',
        error,
      );

      result = [];
    }

    this.logLatency(
      'KB total',
      startedAt,
    );

    /**
     * NON_BLOCKING tool result.
     *
     * WHEN_IDLE prevents the tool result from aggressively interrupting
     * an ongoing natural response.
     */
    this._sendToolResponse(
      fc,
      {
        result,
      },
      'WHEN_IDLE',
    );
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Appointment
  // ──────────────────────────────────────────────────────────────────────────

  async _executeBookAppointment(
    fc,
    startedAt,
  ) {
    const args = fc.args ?? {};

    this.log(
      'Booking appointment:',
      JSON.stringify(args),
    );

    let entry;

    try {
      entry =
        await withTimeout(
          persistAppointment(
            this.callSid,
            args,
          ),
          TOOL_TIMEOUT_MS,
          'Appointment persistence',
        );

      this.bookingIds.push(
        entry.id,
      );

      this.outcome = 'booked';

      this.intent =
        args.reason ||
        'Appointment booking';

      this.caller =
        args.customerName ||
        this.caller;

      /**
       * IMPORTANT:
       *
       * Return the appointment result to Gemini BEFORE CRM synchronization.
       *
       * CRM is background work and should never make the caller wait.
       */
      this._sendToolResponse(
        fc,
        {
          result:
            `Appointment booked successfully. ID: ${entry.id}`,
        },
        'INTERRUPT',
      );

      this.logLatency(
        'Appointment DB + tool response',
        startedAt,
      );

      /**
       * CRM sync is deliberately non-blocking.
       */
      if (
        getCrmProvider() !==
        'none'
      ) {
        runBackground(
          'appointment-crm-sync',
          async () => {
            try {
              const sync =
                await withTimeout(
                  syncToCrm({
                    contact: {
                      name:
                        args.customerName,
                      phone:
                        this.phone,
                      source:
                        'phone',
                    },

                    call: {
                      callSid:
                        this.callSid,
                      intent:
                        this.intent,
                      outcome:
                        'booked',
                    },

                    appointment: {
                      date:
                        entry.date,
                      time:
                        entry.time,
                      reason:
                        entry.reason,
                      status:
                        entry.status,
                    },

                    company:
                      this.companyProfile,
                  }),
                  TOOL_TIMEOUT_MS,
                  'Appointment CRM sync',
                );

              await logCrmSyncEvent({
                callSid:
                  this.callSid,

                provider:
                  sync.provider,

                status:
                  sync.ok
                    ? 'success'
                    : 'failed',

                error:
                  sync.error,
              });
            } catch (error) {
              this.err(
                'Background appointment CRM sync failed:',
                error,
              );
            }
          },
        );
      }
    } catch (error) {
      this.err(
        'Error persisting appointment:',
        error,
      );

      /**
       * Important:
       *
       * Do not tell the caller that the appointment succeeded when
       * persistence failed.
       */
      this._sendToolResponse(
        fc,
        {
          result:
            'I could not confirm the appointment right now. Please ask the caller to try again.',
        },
        'INTERRUPT',
      );
    }
  }


  /**
   * Safely send a Gemini tool response.
   */
  _sendToolResponse(
    fc,
    result,
    scheduling = 'WHEN_IDLE',
  ) {
    if (
      !fc ||
      !fc.id ||
      !fc.name
    ) {
      return false;
    }

    if (
      !this.isGeminiUsable()
    ) {
      this.log(
        `Skipping tool response after call closed: ${fc.name}`,
      );

      return false;
    }

    try {
      this.geminiSession.sendToolResponse(
        {
          functionResponses: [
            {
              id: fc.id,
              name: fc.name,
              response: {
                ...result,
                scheduling,
              },
            },
          ],
        },
      );

      return true;
    } catch (error) {
      this.err(
        `Failed to send tool response for ${fc.name}:`,
        error,
      );

      return false;
    }
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Gemini audio -> Exotel
  // ──────────────────────────────────────────────────────────────────────────

  _handleGeminiAudio(
    base64Audio,
  ) {
    if (
      this.closed ||
      this.closing
    ) {
      return;
    }

    try {
      const rawGemini =
        Buffer.from(
          base64Audio,
          'base64',
        );

      if (!rawGemini.length) {
        return;
      }

      if (
        this.firstGeminiAudioAtMs ===
        null
      ) {
        this.firstGeminiAudioAtMs =
          nowMs();

        this.log(
          `⏱ First Gemini audio: ${
            this.firstGeminiAudioAtMs -
            this.startedAtMs
          }ms after call start`,
        );
      }

      this.lastGeminiAudioAtMs =
        nowMs();

      const rawExotel =
        EXOTEL_SAMPLE_RATE ===
        GEMINI_OUTPUT_SAMPLE_RATE
          ? rawGemini
          : resamplePcm16(
              rawGemini,
              GEMINI_OUTPUT_SAMPLE_RATE,
              EXOTEL_SAMPLE_RATE,
            );

      /**
       * Avoid Buffer.concat when there is no existing data.
       */
      if (
        this.outputBuffer.length ===
        0
      ) {
        this.outputBuffer =
          rawExotel;
      } else {
        this.outputBuffer =
          Buffer.concat([
            this.outputBuffer,
            rawExotel,
          ]);
      }

      this._flushOutputBuffer();
    } catch (error) {
      this.err(
        'Error processing Gemini audio:',
        error,
      );
    }
  }


  /**
   * Send output audio in valid Exotel-sized chunks.
   */
  _flushOutputBuffer(
    force = false,
  ) {
    while (
      this.outputBuffer.length >=
      EXOTEL_CHUNK_BYTES
    ) {
      const chunk =
        this.outputBuffer.subarray(
          0,
          EXOTEL_CHUNK_BYTES,
        );

      this.outputBuffer =
        this.outputBuffer.subarray(
          EXOTEL_CHUNK_BYTES,
        );

      this._sendMediaToExotel(
        chunk,
      );
    }

    if (
      force &&
      this.outputBuffer.length > 0
    ) {
      const remainder =
        this.outputBuffer.length %
        320;

      const padded =
        remainder === 0
          ? this.outputBuffer
          : Buffer.concat([
              this.outputBuffer,
              Buffer.alloc(
                320 - remainder,
              ),
            ]);

      this._sendMediaToExotel(
        padded,
      );

      this.outputBuffer =
        Buffer.alloc(0);
    }
  }


  _sendMediaToExotel(
    pcm16Buf,
  ) {
    if (
      !pcm16Buf ||
      !pcm16Buf.length
    ) {
      return;
    }

    if (
      this.firstExotelAudioAtMs ===
      null
    ) {
      this.firstExotelAudioAtMs =
        nowMs();

      this.log(
        `⏱ First Exotel audio: ${
          this.firstExotelAudioAtMs -
          this.startedAtMs
        }ms after call start`,
      );

      if (
        this.firstGeminiAudioAtMs
      ) {
        this.log(
          `⏱ Gemini → Exotel audio handoff: ${
            this.firstExotelAudioAtMs -
            this.firstGeminiAudioAtMs
          }ms`,
        );
      }
    }

    this._sendExotelFrame({
      event: 'media',

      streamSid:
        this.streamSid,

      media: {
        payload:
          pcm16Buf.toString(
            'base64',
          ),
      },
    });
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Barge-in
  // ──────────────────────────────────────────────────────────────────────────

  _handleBargeIn() {
    if (
      this.closed ||
      this.closing
    ) {
      return;
    }

    const now = nowMs();

    /**
     * Ignore duplicate interruption events that arrive very close
     * together.
     */
    if (
      now - this.lastInterruptAt <
      BARGE_IN_DEBOUNCE_MS
    ) {
      this.log(
        'Duplicate Gemini interruption ignored',
      );

      return;
    }

    this.lastInterruptAt = now;

    /**
     * Always discard audio that has not yet been sent.
     */
    this.outputBuffer =
      Buffer.alloc(0);

    /**
     * Do not send multiple clear commands for the same interruption.
     */
    if (
      now - this.clearSentAt <
      BARGE_IN_DEBOUNCE_MS
    ) {
      return;
    }

    this.clearSentAt = now;

    this.log(
      'Barge-in detected — clearing Exotel audio',
    );

    this._sendExotelFrame({
      event: 'clear',
      streamSid:
        this.streamSid,
    });
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Exotel output
  // ──────────────────────────────────────────────────────────────────────────

  _sendExotelFrame(frame) {
    if (
      !this.exotelWs ||
      this.exotelWs.readyState !== 1
    ) {
      return false;
    }

    try {
      this.exotelWs.send(
        JSON.stringify(frame),
      );

      return true;
    } catch (error) {
      this.err(
        'Error sending Exotel frame:',
        error,
      );

      return false;
    }
  }


  // ──────────────────────────────────────────────────────────────────────────
  // Call close
  // ──────────────────────────────────────────────────────────────────────────

  async close() {
    if (
      this.cleanupPromise
    ) {
      return this.cleanupPromise;
    }

    if (this.closed) {
      return;
    }

    this.cleanupPromise =
      this._closeInternal();

    return this.cleanupPromise;
  }


  async _closeInternal() {
    if (this.closed) {
      return;
    }

    this.closing = true;

    this.log(
      'Closing call session',
    );

    /**
     * Do not accept new work.
     */
    this.outputBuffer =
      Buffer.alloc(0);

    /**
     * Prevent late asynchronous tools from attempting to send
     * responses into a closed Gemini session.
     */
    this.closed = true;

    /**
     * Close Gemini first.
     */
    if (this.geminiSession) {
      try {
        this.geminiSession.close();
      } catch (error) {
        this.err(
          'Error closing Gemini session:',
          error,
        );
      }

      this.geminiSession =
        null;
    }

    /**
     * Persist call record.
     *
     * Existing DB API remains unchanged.
     */
    try {
      if (
        this.outcome === 'answered' &&
        this.transcript.length === 0
      ) {
        this.outcome = 'missed';
      }

      const record =
        this.buildCallRecord();

      await upsertCallRecord(
        record,
      );

      this.log(
        `📞 Call record saved (${record.outcome}, ${record.transcript.length} turns)`,
      );

      /**
       * Final CRM sync is background work from the perspective of the
       * call itself. The call has already ended.
       */
      if (
        getCrmProvider() !==
        'none'
      ) {
        runBackground(
          'call-crm-sync',
          async () => {
            try {
              const sync =
                await withTimeout(
                  syncToCrm({
                    contact: {
                      name:
                        this.caller,
                      phone:
                        this.phone,
                      source:
                        'phone',
                    },

                    call: {
                      callSid:
                        this.callSid,
                      intent:
                        this.intent,
                      outcome:
                        record.outcome,
                      summary:
                        record.summary,
                      durationSec:
                        record.durationSec,
                      startedAt:
                        record.startedAt,
                    },

                    company:
                      this.companyProfile,
                  }),
                  TOOL_TIMEOUT_MS,
                  'Call CRM sync',
                );

              await logCrmSyncEvent({
                callSid:
                  this.callSid,

                provider:
                  sync.provider,

                status:
                  sync.ok
                    ? 'success'
                    : 'failed',

                error:
                  sync.error,
              });
            } catch (error) {
              this.err(
                'Background call CRM sync failed:',
                error,
              );
            }
          },
        );
      }
    } catch (error) {
      this.err(
        'Error persisting call record:',
        error,
      );
    } finally {
      this.closing = false;
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Greeting
// ─────────────────────────────────────────────────────────────────────────────

function buildGreeting(
  companyProfile,
) {
  const companyName =
    companyProfile.name ||
    'our company';

  return `Thank you for calling ${companyName}. This is Maya, how can I help you today?`;
}


// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // ──────────────────────────────────────────────────────────────────────────
  // Environment validation
  // ──────────────────────────────────────────────────────────────────────────

  const geminiApiKey =
    process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    console.error(
      '[bridge] FATAL: GEMINI_API_KEY environment variable is not set.\n' +
      '  Set it in .env.local or your deployment environment.\n' +
      '  Do NOT use NEXT_PUBLIC_GOOGLE_API_KEY.',
    );

    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      '[bridge] FATAL: DATABASE_URL is not set.',
    );

    process.exit(1);
  }

  const ai =
    new GoogleGenAI({
      apiKey:
        geminiApiKey,
    });


  // ──────────────────────────────────────────────────────────────────────────
  // Load company profile
  // ──────────────────────────────────────────────────────────────────────────

  let companyProfile;

  try {
    companyProfile =
      await loadCompanyProfile();
  } catch (error) {
    console.error(
      '[bridge] FATAL: Could not load company profile:',
      error.message,
    );

    process.exit(1);
  }

  console.log(
    `[bridge] Config loaded — company: ${
      companyProfile.name ||
      '(unnamed)'
    }, CRM: ${getCrmProvider()}`,
  );

  console.log(
    `[bridge] Gemini model: ${GEMINI_MODEL}`,
  );


  // ──────────────────────────────────────────────────────────────────────────
  // Next.js
  // ──────────────────────────────────────────────────────────────────────────

  const dev =
    process.env.NODE_ENV !==
    'production';

  const port =
    parseInt(
      process.env.PORT ??
        '3000',
      10,
    );

  const app =
    next({
      dev,
      dir: path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
      ),
    });

  const handle =
    app.getRequestHandler();

  console.log(
    '[bridge] Preparing Next.js…',
  );

  await app.prepare();


  // ──────────────────────────────────────────────────────────────────────────
  // HTTP
  // ──────────────────────────────────────────────────────────────────────────

  const server =
    http.createServer(
      (req, res) => {
        /**
         * Lightweight health endpoint.
         *
         * Useful for Render/UptimeRobot and does not touch Gemini/DB.
         */
        if (
          req.url === '/ping'
        ) {
          res.writeHead(
            200,
            {
              'Content-Type':
                'text/plain; charset=utf-8',
              'Cache-Control':
                'no-store',
            },
          );

          res.end('pong');

          return;
        }

        handle(req, res);
      },
    );


  // ──────────────────────────────────────────────────────────────────────────
  // WebSocket servers
  // ──────────────────────────────────────────────────────────────────────────

  const wss =
    new WebSocketServer({
      noServer: true,
    });

  const browserWss =
    new WebSocketServer({
      noServer: true,
    });

  const browserSessionsByIp =
    new Map();

  const maxBrowserSessionsPerIp =
    Number(
      process.env.BROWSER_MAX_SESSIONS_PER_IP ??
      3,
    );


  // ──────────────────────────────────────────────────────────────────────────
  // WebSocket upgrade
  // ──────────────────────────────────────────────────────────────────────────

  server.on(
    'upgrade',
    (req, socket, head) => {
      const url =
        new URL(
          req.url,
          'http://localhost',
        );

      // ────────────────────────────────────────────────────────────────────
      // Exotel
      // ────────────────────────────────────────────────────────────────────

      if (
        url.pathname ===
        '/ws/exotel'
      ) {
        wss.handleUpgrade(
          req,
          socket,
          head,
          (ws) => {
            wss.emit(
              'connection',
              ws,
              req,
            );
          },
        );

        return;
      }


      // ────────────────────────────────────────────────────────────────────
      // Browser voice session
      // ────────────────────────────────────────────────────────────────────

      if (
        url.pathname ===
        '/ws/browser'
      ) {
        const configuredOrigin =
          process.env.PUBLIC_APP_ORIGIN;

        const origin =
          req.headers.origin;

        const ip =
          req.socket.remoteAddress ??
          'unknown';

        const activeSessions =
          browserSessionsByIp.get(
            ip,
          ) ?? 0;

        if (
          configuredOrigin &&
          origin &&
          origin !== configuredOrigin
        ) {
          socket.write(
            'HTTP/1.1 403 Forbidden\r\n\r\n',
          );

          socket.destroy();

          return;
        }

        if (
          activeSessions >=
          maxBrowserSessionsPerIp
        ) {
          socket.write(
            'HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\n\r\n',
          );

          socket.destroy();

          return;
        }

        browserSessionsByIp.set(
          ip,
          activeSessions + 1,
        );

        browserWss.handleUpgrade(
          req,
          socket,
          head,
          (ws) => {
            ws._keralaiIp =
              ip;

            browserWss.emit(
              'connection',
              ws,
              req,
            );
          },
        );

        return;
      }


      // Unknown WebSocket path.
      socket.destroy();
    },
  );


  // ──────────────────────────────────────────────────────────────────────────
  // Browser WebSocket
  // ──────────────────────────────────────────────────────────────────────────

  browserWss.on(
    'connection',
    (ws, req) => {
      console.log(
        '[bridge] New browser voice session from',
        req.socket.remoteAddress,
      );

      const session =
        new BrowserSession(
          ws,
          ai,
          companyProfile,
          buildSystemInstruction,
          buildTools,
          buildGreeting,
        );

      const sessionTtl =
        setTimeout(
          () => {
            session
              .send({
                type: 'error',
                message:
                  'This demo session has reached its time limit.',
              });

            session
              .close()
              .finally(
                () =>
                  ws.close(
                    1000,
                    'Session TTL reached',
                  ),
              );
          },
          Number(
            process.env.BROWSER_SESSION_TTL_MS ??
            15 * 60 * 1000,
          ),
        );


      ws.on(
        'message',
        async (raw) => {
          let frame;

          try {
            frame =
              JSON.parse(
                raw.toString(),
              );
          } catch {
            ws.close(
              1003,
              'JSON frames required',
            );

            return;
          }

          try {
            if (
              frame.type ===
              'start'
            ) {
              await session.open(
                frame,
              );
            } else if (
              frame.type ===
              'audio'
            ) {
              session.sendAudio(
                frame.data,
                frame.mimeType,
              );
            } else if (
              frame.type ===
              'stop'
            ) {
              await session.close();

              ws.close(
                1000,
                'Session complete',
              );
            }
          } catch (error) {
            console.error(
              '[bridge][browser] frame failed:',
              error,
            );

            session.send({
              type: 'error',
              message:
                'Unable to start the voice session.',
            });

            await session.close();
          }
        },
      );


      ws.on(
        'close',
        () => {
          clearTimeout(
            sessionTtl,
          );

          const ip =
            ws._keralaiIp;

          const count =
            browserSessionsByIp.get(
              ip,
            ) ?? 1;

          if (count <= 1) {
            browserSessionsByIp.delete(
              ip,
            );
          } else {
            browserSessionsByIp.set(
              ip,
              count - 1,
            );
          }

          session
            .close()
            .catch(
              (error) =>
                console.error(
                  '[bridge][browser] close failed:',
                  error,
                ),
            );
        },
      );


      ws.on(
        'error',
        (error) =>
          console.error(
            '[bridge][browser] WebSocket error:',
            error,
          ),
      );
    },
  );


  // ──────────────────────────────────────────────────────────────────────────
  // Exotel WebSocket
  // ──────────────────────────────────────────────────────────────────────────

  wss.on(
    'connection',
    (ws, req) => {
      console.log(
        '[bridge] New Exotel WebSocket connection from',
        req.socket.remoteAddress,
      );

      /**
       * Exactly one CallSession per Exotel WebSocket.
       */
      let session = null;


      ws.on(
        'message',
        async (raw) => {
          let frame;

          try {
            frame =
              JSON.parse(
                raw.toString(),
              );
          } catch {
            console.warn(
              '[bridge] Received non-JSON WebSocket frame — ignoring',
            );

            return;
          }

          switch (
            frame.event
          ) {
            // ──────────────────────────────────────────────────────────────
            // Connected
            // ──────────────────────────────────────────────────────────────

            case 'connected':
              console.log(
                '[bridge] Exotel connected event received',
              );

              break;


            // ──────────────────────────────────────────────────────────────
            // Start
            // ──────────────────────────────────────────────────────────────

            case 'start': {
              const startMeta =
                frame.start ??
                frame;

              const callSid =
                frame.call_sid ??
                frame.callSid ??
                startMeta.call_sid ??
                startMeta.callSid ??
                startMeta.call?.sid ??
                'unknown';

              const streamSid =
                frame.stream_sid ??
                frame.streamSid ??
                startMeta.stream_sid ??
                startMeta.streamSid ??
                startMeta.stream?.sid ??
                'unknown';

              console.log(
                `[bridge] Call started — callSid=${callSid}, streamSid=${streamSid}`,
              );

              /**
               * Guard duplicate start events.
               */
              if (session) {
                console.warn(
                  '[bridge] Duplicate start event — ignoring',
                );

                break;
              }

              session =
                new CallSession(
                  callSid,
                  streamSid,
                  ws,
                  ai,
                  companyProfile,
                );

              session.caller =
                startMeta.from ??
                startMeta.caller ??
                startMeta
                  .custom_parameters
                  ?.caller ??
                'Unknown caller';

              session.phone =
                startMeta.from ??
                startMeta
                  .custom_parameters
                  ?.phone ??
                null;

              try {
                await session.openGeminiSession();
              } catch (error) {
                console.error(
                  `[bridge][${callSid}] Failed to open Gemini session:`,
                  error,
                );

                try {
                  await session.close();
                } catch {
                  // Ignore cleanup failure.
                }

                session = null;

                /**
                 * Fail fast instead of leaving Exotel connected to
                 * a dead voicebot.
                 */
                if (
                  ws.readyState === 1
                ) {
                  ws.close(
                    1011,
                    'Gemini session failed to open',
                  );
                }
              }

              break;
            }


            // ──────────────────────────────────────────────────────────────
            // Media
            // ──────────────────────────────────────────────────────────────

            case 'media': {
              if (!session) {
                console.warn(
                  '[bridge] Media received before start event — ignoring',
                );

                break;
              }

              const payload =
                frame.media?.payload;

              if (payload) {
                session.handleExotelMedia(
                  payload,
                );
              }

              break;
            }


            // ──────────────────────────────────────────────────────────────
            // DTMF
            // ──────────────────────────────────────────────────────────────

            case 'dtmf':
              if (session) {
                session.log(
                  'DTMF event received (ignored):',
                  frame,
                );
              }

              break;


            // ──────────────────────────────────────────────────────────────
            // Stop
            // ──────────────────────────────────────────────────────────────

            case 'stop':
              console.log(
                '[bridge] Exotel stop event — closing session',
              );

              if (session) {
                const closingSession =
                  session;

                session = null;

                await closingSession.close();
              }

              break;


            default:
              console.log(
                '[bridge] Unknown Exotel event:',
                frame.event,
              );
          }
        },
      );


      ws.on(
        'close',
        async (code, reason) => {
          console.log(
            `[bridge] Exotel WebSocket closed (code=${code}, reason=${reason})`,
          );

          if (session) {
            const closingSession =
              session;

            session = null;

            await closingSession.close();
          }
        },
      );


      ws.on(
        'error',
        (error) => {
          console.error(
            '[bridge] Exotel WebSocket error:',
            error,
          );
        },
      );
    },
  );


  // ──────────────────────────────────────────────────────────────────────────
  // Start
  // ──────────────────────────────────────────────────────────────────────────

  server.listen(
    port,
    () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║  KeralaI Receptionist — Next.js + Exotel Bridge            ║
╠══════════════════════════════════════════════════════════════╣
║  Next.js app       : http://localhost:${port}
║  Exotel WS         : ws://localhost:${port}/ws/exotel
║  Health            : http://localhost:${port}/ping
║                                                              ║
║  Gemini model      : ${GEMINI_MODEL}
║  Exotel sample     : ${EXOTEL_SAMPLE_RATE} Hz
║  Gemini input      : ${GEMINI_INPUT_SAMPLE_RATE} Hz
║  Gemini output     : ${GEMINI_OUTPUT_SAMPLE_RATE} Hz
║  Exotel chunk      : ${EXOTEL_CHUNK_MS} ms
║  KB result count   : ${KB_RESULT_COUNT}
║  DB                : Neon Postgres
║  CRM               : ${getCrmProvider()}
╚══════════════════════════════════════════════════════════════╝
`);
    },
  );


  // ──────────────────────────────────────────────────────────────────────────
  // Graceful shutdown
  // ──────────────────────────────────────────────────────────────────────────

  let shuttingDown = false;

  const shutdown =
    async (signal) => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      console.log(
        `[bridge] ${signal} received — shutting down gracefully…`,
      );

      const forceExit =
        setTimeout(
          () => {
            console.error(
              '[bridge] Shutdown timed out — forcing exit.',
            );

            process.exit(1);
          },
          10_000,
        );

      server.close(
        async () => {
          try {
            await closePool();
          } catch (error) {
            console.error(
              '[bridge] Error closing Postgres pool:',
              error.message,
            );
          }

          clearTimeout(
            forceExit,
          );

          console.log(
            '[bridge] Shutdown complete.',
          );

          process.exit(0);
        },
      );
    };

  process.on(
    'SIGTERM',
    () => shutdown('SIGTERM'),
  );

  process.on(
    'SIGINT',
    () => shutdown('SIGINT'),
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Startup
// ─────────────────────────────────────────────────────────────────────────────

main().catch(
  (error) => {
    console.error(
      '[bridge] Fatal startup error:',
      error,
    );

    process.exit(1);
  },
);
