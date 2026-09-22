/**
 * server.mjs
 *
 * Next.js custom server that also hosts the Exotel ↔ Gemini Live WebSocket
 * bridge at  ws://host/ws/exotel
 *
 * Run:
 *   npm run dev:bridge      # development (Next.js hot-reload + bridge)
 *   npm run start:bridge    # production
 *
 * Required env vars:
 *   GEMINI_API_KEY          — server-side Gemini key (NOT NEXT_PUBLIC_)
 *
 * Optional env vars:
 *   PORT                    — HTTP port (default 3000)
 *   EXOTEL_SAMPLE_RATE      — 8000 or 16000 (default 8000)
 *   MAYA_VOICE              — Gemini voice name (default Kore)
 *   MAYA_PITCH              — Low | Normal | High (default Normal)
 *   MAYA_SPEED              — Slow | Normal | Fast (default Normal)
 *   MAYA_KNOWLEDGE_JSON     — absolute path to a JSON file containing
 *                             KnowledgeItem[] for phone calls (optional)
 *   MAYA_COMPANY_JSON       — absolute path to a JSON file containing
 *                             CompanyProfile for phone calls (optional)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

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
} from './server/db.mjs';
import { getCrmProvider, syncToCrm } from './server/crm.mjs';

// ─── Load .env.local (Next.js does this automatically; plain `node` does not) ─
// Supports: KEY=value, KEY="value", KEY='value', and # comments. Skips blanks.
// Does NOT override variables already set in the environment.
{
  const envFiles = ['.env.local', '.env'];
  const dir = path.dirname(fileURLToPath(import.meta.url));
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
      // Strip optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Don't override values already set by the shell
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
    console.log(`[bridge] Loaded env from ${file}`);
    break; // Stop after the first file found (.env.local takes priority)
  }
}

// ─── Shared prompt/tool logic ────────────────────────────────────────────────
// server.mjs is ESM; the TypeScript source is compiled by Next.js for the
// browser. For the server we import the compiled JS from .next/server, but
// that only works after a build.  Instead we duplicate the tiny logic here
// using a require() shim so we don't need a build step to run the bridge.
//
// The actual canonical source is lib/maya-config.ts — do NOT edit the logic
// below; edit maya-config.ts and keep them in sync.
// The bridge is intentionally kept self-contained so `npm run dev:bridge`
// works without a prior `npm run build`.
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @param {import('./types.ts').CompanyProfile} companyProfile
 *  @param {{ pitch?: string, speed?: string }} voiceSettings
 *  @returns {string}
 */
function buildSystemInstruction(companyProfile, voiceSettings = {}) {
  const pitch = voiceSettings.pitch ?? 'Normal';
  const speed = voiceSettings.speed ?? 'Normal';

  const profileInstruction = `
COMPANY DETAILS:
- Name: ${companyProfile.name || 'The Company'}
- Industry: ${companyProfile.industry || 'General'}
- Description: ${companyProfile.description || 'A business in Kerala'}
- Address: ${companyProfile.address || 'Kerala'}
- Contact: ${companyProfile.contactPhone || 'Not provided'} / ${companyProfile.contactEmail || 'Not provided'}`.trim();

  return `
You are Maya, a highly professional, welcoming, and intelligent AI receptionist for ${companyProfile.name || 'our company'}.
Your primary language is Malayalam, but you are equally fluent in English. You should seamlessly switch between the two based on the caller's language or preference.
Your tone should be warm, polite, and extremely helpful. Speak at a natural, unhurried pace, like a helpful human receptionist.

VOICE SETTINGS:
- Pitch: ${pitch}
- Speed: ${speed}

${profileInstruction}

CORE RESPONSIBILITIES:
1. Greet callers warmly.
2. Answer questions accurately. Use the searchKnowledgeBase tool to find relevant information about services, pricing, or the company whenever the user asks a question. DO NOT guess answers.
3. Assist with booking appointments. When a caller wants to book, politely ask for their Name, preferred Date, and preferred Time. Once you have all three, use the bookAppointment tool to confirm the booking.
4. Keep your responses concise and conversational. Do not output long lists or markdown formatting, as you are speaking over the phone.
`.trim();
}

/** @returns {import('@google/genai').Tool[]} */
function buildTools() {
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
        }
      ],
    },
  ];
}

// ─── Audio resampling (pure JS, no native addons) ────────────────────────────

/**
 * Linear interpolation resampler.
 * Works on raw PCM16 little-endian buffers (Node Buffer).
 *
 * @param {Buffer} input      Raw PCM16 LE mono samples
 * @param {number} inRate     Input sample rate
 * @param {number} outRate    Output sample rate
 * @returns {Buffer}          Resampled PCM16 LE mono samples
 */
function resamplePcm16(input, inRate, outRate) {
  if (inRate === outRate) return input;

  const inSamples = input.length / 2; // 2 bytes per int16 sample
  const ratio = inRate / outRate;
  const outSamples = Math.round(inSamples / ratio);
  const out = Buffer.allocUnsafe(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    const s0 = input.readInt16LE(Math.min(srcIdx, inSamples - 1) * 2);
    const s1 = input.readInt16LE(Math.min(srcIdx + 1, inSamples - 1) * 2);
    const interpolated = Math.round(s0 + frac * (s1 - s0));

    // Clamp to int16 range
    out.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
  }

  return out;
}

// ─── Appointment + call persistence ─────────────────────────────────────────
// All persistence lives in server/db.mjs (Neon Postgres). The bridge imports
// persistAppointment and upsertCallRecord from there so phone calls and the
// dashboard share one source of truth.

// ─── Call session ─────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_INPUT_SAMPLE_RATE = 16000;  // Gemini Live expects 16 kHz input
const GEMINI_OUTPUT_SAMPLE_RATE = 24000; // Gemini Live outputs 24 kHz

// Exotel-side sample rate (configurable, default 8000)
const EXOTEL_SAMPLE_RATE = parseInt(process.env.EXOTEL_SAMPLE_RATE ?? '8000', 10);

// Exotel chunk size constraint: multiples of 320 bytes, target ~100ms
// At 8kHz 16-bit: 100ms = 8000*0.1*2 = 1600 bytes = 5 * 320
// At 16kHz 16-bit: 100ms = 16000*0.1*2 = 3200 bytes = 10 * 320
const EXOTEL_CHUNK_BYTES = EXOTEL_SAMPLE_RATE === 16000 ? 3200 : 1600;

/**
 * Manages the state of a single inbound Exotel phone call.
 */
class CallSession {
  /**
   * @param {string} callSid
   * @param {string} streamSid
   * @param {WebSocket} exotelWs      — the Exotel WebSocket connection
   * @param {import('@google/genai').GoogleGenAI} ai
   * @param {import('./types.ts').CompanyProfile} companyProfile
   */
  constructor(callSid, streamSid, exotelWs, ai, companyProfile) {
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.exotelWs = exotelWs;
    this.ai = ai;
    this.companyProfile = companyProfile;

    /** @type {import('@google/genai').Session | null} */
    this.geminiSession = null;

    /** Accumulator for Gemini output audio before chunking to Exotel */
    this.outputBuffer = Buffer.alloc(0);

    // ── Call reporting state ────────────────────────────────────────────────
    this.startedAt = new Date().toISOString();
    /** @type {{ role: 'caller'|'maya', text: string, at: string }[]} */
    this.transcript = [];
    /** @type {string[]} */
    this.bookingIds = [];
    /** @type {string[]} */
    this.knowledgeQueries = [];
    this.outcome = 'answered';
    this.intent = null;
    this.caller = 'Unknown caller';
    this.phone = null;
    this.callRecordId = `call-${callSid}`;

    this.closed = false;
  }

  log(...args) {
    console.log(`[bridge][${this.callSid}]`, ...args);
  }

  err(...args) {
    console.error(`[bridge][${this.callSid}]`, ...args);
  }

  /** Append a transcript turn, merging consecutive turns from the same speaker. */
  addTranscript(role, text) {
    if (!text || !text.trim()) return;
    const clean = text.trim();
    const last = this.transcript[this.transcript.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text} ${clean}`.trim();
      return;
    }
    this.transcript.push({ role, text: clean, at: new Date().toISOString() });
  }

  /** Build the persisted call record from current session state. */
  buildCallRecord() {
    const endedAt = new Date().toISOString();
    const durationSec = Math.max(
      0,
      Math.round((new Date(endedAt).getTime() - new Date(this.startedAt).getTime()) / 1000),
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
        ? this.transcript.slice(0, 4).map((turn) => `${turn.role === 'caller' ? 'Caller' : 'Maya'}: ${turn.text}`).join(' ')
        : null,
      sentiment: 'neutral',
      transcript: this.transcript,
      bookingIds: this.bookingIds,
      knowledgeQueries: this.knowledgeQueries,
    };
  }

  /** Open a fresh Gemini Live session for this call. */
  async openGeminiSession() {
    const voiceName = process.env.MAYA_VOICE ?? 'Aoede';
    const pitch = process.env.MAYA_PITCH ?? 'Normal';
    const speed = process.env.MAYA_SPEED ?? 'Normal';

    const systemInstruction = buildSystemInstruction(
      this.companyProfile,
      { pitch, speed },
    );

    this.log(`Connecting to Gemini Live (model: ${GEMINI_MODEL}, voice: ${voiceName})`);

    // ai.live.connect() is identical in Node and browser (same SDK entry point)
    this.geminiSession = await this.ai.live.connect({
      model: GEMINI_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        systemInstruction,
        tools: buildTools(),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          this.log('Gemini Live session opened');
          this.geminiSession.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: `System command: Greet the caller with: "${buildGreeting(this.companyProfile)}"` }] }],
            turnComplete: true
          });
        },

        onmessage: (message) => {
          if (this.closed) return;
          try {
            this._handleGeminiMessage(message).catch(e => this.err("Error in _handleGeminiMessage:", e));
          } catch (e) {
            this.err('Error handling Gemini message:', e);
          }
        },

        onerror: (err) => {
          this.err('Gemini Live error:', err);
          // Don't close the Exotel socket — let the call continue silently
          // and log the error. Maya will just stop responding until Gemini recovers.
        },

        onclose: (evt) => {
          this.log('Gemini Live session closed', evt?.code, evt?.reason);
        },
      },
    });

    this.log('Gemini Live session ready');
  }

  /**
   * Handle an audio media chunk from Exotel.
   * @param {string} base64Payload  Base64-encoded PCM16 @ EXOTEL_SAMPLE_RATE
   */
  handleExotelMedia(base64Payload) {
    if (this.closed || !this.geminiSession) return;

    try {
      // 1. Decode base64 → raw PCM16 buffer
      const rawExotel = Buffer.from(base64Payload, 'base64');

      // 2. Upsample to Gemini's expected input rate (if needed)
      const rawGemini =
        EXOTEL_SAMPLE_RATE === GEMINI_INPUT_SAMPLE_RATE
          ? rawExotel
          : resamplePcm16(rawExotel, EXOTEL_SAMPLE_RATE, GEMINI_INPUT_SAMPLE_RATE);

      // 3. Forward to Gemini Live as PCM16 blob
      this.geminiSession.sendRealtimeInput({
        media: {
          data: rawGemini.toString('base64'),
          mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
        },
      });
    } catch (e) {
      this.err('Error processing Exotel media chunk:', e);
    }
  }

  /**
   * Handle a message from Gemini Live.
   * @param {import('@google/genai').LiveServerMessage} message
   */
  async _handleGeminiMessage(message) {
    // ── Transcripts ──────────────────────────────────────────────────────────
    const inputTranscript = message.serverContent?.inputTranscription?.text;
    if (inputTranscript) this.addTranscript('caller', inputTranscript);
    const outputTranscript = message.serverContent?.outputTranscription?.text;
    if (outputTranscript) this.addTranscript('maya', outputTranscript);

    // ── Tool calls ───────────────────────────────────────────────────────────
    if (message.toolCall) {
      this.log('Tool call received:', JSON.stringify(message.toolCall));
      for (const fc of message.toolCall.functionCalls) {
        if (fc.name === 'bookAppointment') {
          const args = fc.args;
          let result;
          try {
            const entry = await persistAppointment(this.callSid, args);
            this.bookingIds.push(entry.id);
            this.outcome = 'booked';
            this.intent = args.reason || 'Appointment booking';
            this.caller = args.customerName || this.caller;
            result = { result: `Appointment booked successfully. ID: ${entry.id}` };

            // Mirror the booking into the CRM (best-effort, non-blocking failures).
            if (getCrmProvider() !== 'none') {
              const sync = await syncToCrm({
                contact: { name: args.customerName, phone: this.phone, source: 'phone' },
                call: { callSid: this.callSid, intent: this.intent, outcome: 'booked' },
                appointment: { date: entry.date, time: entry.time, reason: entry.reason, status: entry.status },
                company: this.companyProfile,
              });
              await logCrmSyncEvent({
                callSid: this.callSid,
                provider: sync.provider,
                status: sync.ok ? 'success' : 'failed',
                error: sync.error,
              });
            }
          } catch (e) {
            this.err('Error persisting appointment:', e);
            result = { result: 'Appointment booking recorded (storage error, please confirm manually).' };
          }

          this.geminiSession.sendToolResponse({
            functionResponses: {
              id: fc.id,
              name: fc.name,
              response: result,
            },
          });
        } else if (fc.name === 'searchKnowledgeBase') {
          const args = fc.args;
          let result = [];
          try {
            this.knowledgeQueries.push(args.query);
            if (!this.intent) this.intent = args.query;

            // Embed the query, then run a pgvector similarity search.
            const response = await this.ai.models.embedContent({
              model: 'gemini-embedding-2',
              contents: args.query,
            });
            const queryVector = response.embeddings?.[0]?.values;
            if (queryVector) {
              result = await searchKnowledgeEmbeddings(`[${queryVector.join(',')}]`, 3);
            }
          } catch (e) {
            this.err('Error searching knowledge base:', e);
          }
          this.geminiSession.sendToolResponse({
            functionResponses: {
              id: fc.id,
              name: fc.name,
              response: { result },
            },
          });
        } else {
          this.log(`Unknown tool call: ${fc.name}`);
          // Send a generic OK so Gemini doesn't stall
          this.geminiSession.sendToolResponse({
            functionResponses: {
              id: fc.id,
              name: fc.name,
              response: { result: 'OK' },
            },
          });
        }
      }
    }

    // ── Audio output ─────────────────────────────────────────────────────────
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      try {
        // 1. Decode base64 → raw PCM16 @ 24 kHz
        const rawGemini = Buffer.from(base64Audio, 'base64');

        // 2. Downsample to Exotel's sample rate
        const rawExotel =
          EXOTEL_SAMPLE_RATE === GEMINI_OUTPUT_SAMPLE_RATE
            ? rawGemini
            : resamplePcm16(rawGemini, GEMINI_OUTPUT_SAMPLE_RATE, EXOTEL_SAMPLE_RATE);

        // 3. Accumulate and flush in correctly-sized chunks
        this.outputBuffer = Buffer.concat([this.outputBuffer, rawExotel]);
        this._flushOutputBuffer();
      } catch (e) {
        this.err('Error processing Gemini audio output:', e);
      }
    }

    // ── Barge-in (interruption) ───────────────────────────────────────────────
    if (message.serverContent?.interrupted) {
      this.log('Barge-in detected — sending clear to Exotel');
      this.outputBuffer = Buffer.alloc(0); // discard buffered output
      this._sendExotelFrame({ event: 'clear', streamSid: this.streamSid });
    }
  }

  /**
   * Send buffered audio to Exotel in valid chunk sizes.
   * Exotel requires multiples of 320 bytes.
   */
  _flushOutputBuffer(force = false) {
    while (this.outputBuffer.length >= EXOTEL_CHUNK_BYTES) {
      const chunk = this.outputBuffer.subarray(0, EXOTEL_CHUNK_BYTES);
      this.outputBuffer = this.outputBuffer.subarray(EXOTEL_CHUNK_BYTES);
      this._sendMediaToExotel(chunk);
    }

    // On force-flush (end of turn) send whatever remains, zero-padded to
    // the nearest multiple of 320 bytes so Exotel doesn't reject it.
    if (force && this.outputBuffer.length > 0) {
      const remainder = this.outputBuffer.length % 320;
      const padded =
        remainder === 0
          ? this.outputBuffer
          : Buffer.concat([this.outputBuffer, Buffer.alloc(320 - remainder)]);
      this._sendMediaToExotel(padded);
      this.outputBuffer = Buffer.alloc(0);
    }
  }

  /**
   * @param {Buffer} pcm16Buf  Raw PCM16 buffer to send to Exotel
   */
  _sendMediaToExotel(pcm16Buf) {
    const payload = pcm16Buf.toString('base64');
    this._sendExotelFrame({
      event: 'media',
      streamSid: this.streamSid,
      media: { payload },
    });
  }

  /**
   * @param {object} frame  JSON-serialisable Exotel frame
   */
  _sendExotelFrame(frame) {
    if (this.exotelWs.readyState !== 1 /* OPEN */) return;
    try {
      this.exotelWs.send(JSON.stringify(frame));
    } catch (e) {
      this.err('Error sending frame to Exotel:', e);
    }
  }

  /** Tear down this call session cleanly. */
  async close() {
    if (this.closed) return;
    this.closed = true;
    this.log('Closing call session');

    // Flush any remaining buffered audio
    this._flushOutputBuffer(true);

    if (this.geminiSession) {
      try {
        this.geminiSession.close();
      } catch (e) {
        this.err('Error closing Gemini session:', e);
      }
      this.geminiSession = null;
    }

    // Persist the call record for the dashboard (call → action → report flow)
    try {
      if (this.outcome === 'answered' && this.transcript.length === 0) {
        this.outcome = 'missed';
      }
      const record = this.buildCallRecord();
      await upsertCallRecord(record);
      this.log(`📞 Call record saved (${record.outcome}, ${record.transcript.length} turns)`);

      // Mirror the completed call into the CRM.
      if (getCrmProvider() !== 'none') {
        const sync = await syncToCrm({
          contact: { name: this.caller, phone: this.phone, source: 'phone' },
          call: {
            callSid: this.callSid,
            intent: this.intent,
            outcome: record.outcome,
            summary: record.summary,
            durationSec: record.durationSec,
            startedAt: record.startedAt,
          },
          company: this.companyProfile,
        });
        await logCrmSyncEvent({
          callSid: this.callSid,
          provider: sync.provider,
          status: sync.ok ? 'success' : 'failed',
          error: sync.error,
        });
      }
    } catch (e) {
      this.err('Error persisting call record:', e);
    }
  }
}

function buildGreeting(companyProfile) {
  const companyName = companyProfile.name || 'our company';
  return `Thank you for calling ${companyName}. This is Maya, how can I help you today?`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Validate required env vars
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error(
      '[bridge] FATAL: GEMINI_API_KEY environment variable is not set.\n' +
        '  Set it in .env.local (for dev) or your deployment environment.\n' +
        '  Do NOT use NEXT_PUBLIC_GOOGLE_API_KEY — that key is exposed client-side.',
    );
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  // Config now lives in Neon Postgres.
  if (!process.env.DATABASE_URL) {
    console.error(
      '[bridge] FATAL: DATABASE_URL is not set.\n' +
        '  The phone bridge reads the company profile, knowledge base, and CRM\n' +
        '  settings from Neon Postgres. Add DATABASE_URL to .env.local.',
    );
    process.exit(1);
  }

  let companyProfile;
  try {
    companyProfile = await loadCompanyProfile();
  } catch (error) {
    console.error('[bridge] FATAL: Could not load company profile from Postgres:', error.message);
    process.exit(1);
  }

  console.log(
    `[bridge] Config loaded — company: ${companyProfile.name || '(unnamed)'}, CRM: ${getCrmProvider()}`,
  );

  const dev = process.env.NODE_ENV !== 'production';
  const port = parseInt(process.env.PORT ?? '3000', 10);

  // Boot Next.js
  const app = next({ dev, dir: __dirname });
  const handle = app.getRequestHandler();

  console.log('[bridge] Preparing Next.js…');
  await app.prepare();

  // Create HTTP server
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  // Attach WebSocket server — only accepts upgrades on /ws/exotel
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://localhost`);
    if (url.pathname === '/ws/exotel') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      // Not our path — destroy so Next.js doesn't get confused
      socket.destroy();
    }
  });

  // ── Per-connection handler ─────────────────────────────────────────────────
  wss.on('connection', (ws, req) => {
    console.log('[bridge] New Exotel WebSocket connection from', req.socket.remoteAddress);

    /** @type {CallSession | null} */
    let session = null;

    ws.on('message', async (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        console.warn('[bridge] Received non-JSON WebSocket frame — ignoring');
        return;
      }

      switch (frame.event) {
        case 'connected':
          console.log('[bridge] Exotel connected event received');
          break;

        case 'start': {
          const callSid = frame.call_sid ?? frame.callSid ?? 'unknown';
          const streamSid = frame.stream_sid ?? frame.streamSid ?? 'unknown';
          console.log(`[bridge] Call started — callSid=${callSid}, streamSid=${streamSid}`);

          // Guard against duplicate 'start' events
          if (session) {
            console.warn('[bridge] Received duplicate start event — ignoring');
            break;
          }

          session = new CallSession(callSid, streamSid, ws, ai, companyProfile);
          // Capture caller identity when Exotel provides it
          const startMeta = frame.start ?? frame;
          session.caller = startMeta.from ?? startMeta.caller ?? startMeta.custom_parameters?.caller ?? 'Unknown caller';
          session.phone = startMeta.from ?? startMeta.custom_parameters?.phone ?? null;
          try {
            await session.openGeminiSession();
          } catch (e) {
            console.error(`[bridge][${callSid}] Failed to open Gemini session:`, e);
            session = null;
            // Close the Exotel socket so the call fails fast rather than hanging
            ws.close(1011, 'Gemini session failed to open');
          }
          break;
        }

        case 'media': {
          if (!session) {
            console.warn('[bridge] Received media before start event — ignoring');
            break;
          }
          const payload = frame.media?.payload;
          if (payload) session.handleExotelMedia(payload);
          break;
        }

        case 'dtmf':
          if (session) session.log('DTMF event received (ignored):', frame);
          break;

        case 'stop':
          console.log('[bridge] Exotel stop event — closing session');
          if (session) {
            await session.close();
            session = null;
          }
          break;

        default:
          console.log('[bridge] Unknown Exotel event:', frame.event);
      }
    });

    ws.on('close', async (code, reason) => {
      console.log(`[bridge] Exotel WebSocket closed (code=${code}, reason=${reason})`);
      if (session) {
        await session.close();
        session = null;
      }
    });

    ws.on('error', (err) => {
      console.error('[bridge] Exotel WebSocket error:', err);
    });
  });

  // ── Start listening ────────────────────────────────────────────────────────
  server.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  KeralaI Receptionist — Next.js + Exotel Bridge              ║
╠══════════════════════════════════════════════════════════════╣
║  Next.js app :  http://localhost:${port}                        ║
║  Exotel WS   :  ws://localhost:${port}/ws/exotel               ║
║                                                              ║
║  Exotel sample rate : ${EXOTEL_SAMPLE_RATE} Hz                          ║
║  Gemini input rate  : ${GEMINI_INPUT_SAMPLE_RATE} Hz                         ║
║  Gemini output rate : ${GEMINI_OUTPUT_SAMPLE_RATE} Hz                         ║
║  Database           : Neon Postgres                          ║
║  CRM provider       : ${getCrmProvider()}                            ║
╚══════════════════════════════════════════════════════════════╝
`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  // Kubernetes/Docker send SIGTERM before SIGKILL. Stop accepting connections,
  // let in-flight calls finish, then release the Postgres pool.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[bridge] ${signal} received — shutting down gracefully…`);

    const forceExit = setTimeout(() => {
      console.error('[bridge] Shutdown timed out — forcing exit.');
      process.exit(1);
    }, 10_000);

    server.close(async () => {
      try {
        await closePool();
      } catch (error) {
        console.error('[bridge] Error closing Postgres pool:', error.message);
      }
      clearTimeout(forceExit);
      console.log('[bridge] Shutdown complete.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[bridge] Fatal startup error:', err);
  process.exit(1);
});
