/**
 * bridge/server.mjs
 *
 * Standalone Exotel ↔ Gemini Live WebSocket bridge.
 *
 * This is a plain Node.js HTTP + WebSocket server with ZERO Next.js dependency.
 * It is deployed to Render as its own web service, independent of the Next.js
 * dashboard (which deploys to Vercel).
 *
 * Endpoints:
 *   GET  /health          — Render health check, returns 200 {"ok":true}
 *   GET  /ping            — Lightweight keep-alive endpoint (no DB, HEAD/GET supported)
 *   WS   /ws/exotel       — Exotel phone bridge (PCM audio ↔ Gemini Live)
 *   WS   /ws/browser      — Browser voice relay (audio ↔ Gemini Live)
 *
 * Required env vars:
 *   DATABASE_URL          — Neon POOLED (PgBouncer) connection string
 *   GEMINI_API_KEY        — Server-side Gemini key (NOT NEXT_PUBLIC_)
 *
 * Optional env vars:
 *   PORT                  — HTTP port (Render injects this automatically)
 *   EXOTEL_SAMPLE_RATE    — 8000 or 16000 (default 8000)
 *   GEMINI_MODEL          — Gemini Live model (default gemini-3.8-live)
 *   GEMINI_EMBEDDING_MODEL — Embedding model (default gemini-embedding-2)
 *   MAYA_VOICE            — Gemini voice name (default Aoede)
 *   MAYA_PITCH            — Low | Normal | High (default Normal)
 *   MAYA_SPEED            — Slow | Normal | Fast (default Normal)
 *   PUBLIC_APP_ORIGIN     — Exact browser origin allowed for /ws/browser
 *   BROWSER_MAX_SESSIONS_PER_IP — Per-IP limit for /ws/browser (default 3)
 *   BROWSER_SESSION_TTL_MS      — Max browser session duration in ms (default 900000)
 *   PG_POOL_MAX           — Postgres pool size (default 10)
 *   PG_QUERY_TIMEOUT_MS   — Per-query timeout in ms (default 15000)
 *   CRM_TIMEOUT_MS        — CRM webhook timeout in ms (default 8000)
 *   EMBED_TIMEOUT_MS      — Embedding request timeout in ms (default 8000)
 *   DEBUG_TIMING          — Set to "1" to log latency for key operations
 */

import 'dotenv/config';
import http from 'node:http';

import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';

import {
  closePool,
  getProfileVersion,
  loadCompanyProfile,
  logCrmSyncEvent,
  persistAppointment,
  searchKnowledgeEmbeddings,
  upsertCallRecord,
} from './db.mjs';
import { getCrmProvider, syncToCrm } from './crm.mjs';
import { BrowserSession } from './browser-session.mjs';
import {
  buildGreeting,
  buildSystemInstruction,
  buildTools,
  resolveVoiceSettings,
} from './shared/maya-config.mjs';

// ─── DEBUG_TIMING helper ──────────────────────────────────────────────────────
const debugTiming = process.env.DEBUG_TIMING === '1';

/**
 * Returns a stop-timer function that logs elapsed ms when DEBUG_TIMING=1.
 * @param {string} label
 * @returns {() => void}
 */
function timer(label) {
  if (!debugTiming) return () => {};
  const start = Date.now();
  return () => console.log(`[timing] ${label}: ${Date.now() - start}ms`);
}

// ─── Safe background work ─────────────────────────────────────────────────────
/**
 * Runs non-critical work (CRM sync, audit writes, call-row creation) off the
 * real-time audio path. Never throws into the caller and never produces an
 * unhandled rejection. Tracked so graceful shutdown can drain briefly.
 *
 * @param {string} label
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<void>}
 */
const _backgroundTasks = new Set();
function runBackground(label, fn) {
  const task = (async () => {
    try {
      await fn();
    } catch (error) {
      console.error(`[bridge][bg:${label}] failed:`, error?.message ?? error);
    }
  })();
  _backgroundTasks.add(task);
  task.finally(() => _backgroundTasks.delete(task));
  return task;
}

/** Wait (briefly) for in-flight background tasks during shutdown. */
async function drainBackground(timeoutMs = 3000) {
  if (_backgroundTasks.size === 0) return;
  await Promise.race([
    Promise.allSettled([..._backgroundTasks]),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * Rejects if `promise` does not settle within `ms`. Keeps a hung external call
 * (e.g. an embedding request) from stalling a tool response forever.
 */
function withTimeout(promise, ms, label) {
  let handle;
  const timeout = new Promise((_, reject) => {
    handle = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(handle));
}

// ─── Company profile cache (process-level, TTL + version-check) ───────────────
let _cachedProfile = null;
let _profileUpdatedAt = null;
let _lastProfileCheck = 0;
const PROFILE_TTL_MS = Number(process.env.PROFILE_CACHE_TTL_MS ?? 5 * 60 * 1000); // 5 min default

/**
 * Returns the company profile from in-memory cache, refreshing only when:
 *   1. The TTL has elapsed since the last version check, AND
 *   2. The DB's updated_at has changed.
 * This means a single cheap query every TTL interval — not every call.
 */
async function getCompanyProfile() {
  const now = Date.now();
  if (_cachedProfile && (now - _lastProfileCheck) < PROFILE_TTL_MS) {
    return _cachedProfile;
  }

  const doneVersion = timer('profile-version-check');
  const version = await getProfileVersion();
  doneVersion();

  _lastProfileCheck = now;
  const versionStr = version ? new Date(version).toISOString() : null;

  if (_cachedProfile && versionStr === _profileUpdatedAt) {
    return _cachedProfile; // unchanged — skip the full load
  }

  const doneLoad = timer('profile-full-load');
  _cachedProfile = await loadCompanyProfile();
  doneLoad();
  _profileUpdatedAt = versionStr;

  console.log(`[bridge] Company profile loaded/refreshed: "${_cachedProfile.name || '(unnamed)'}"`);
  return _cachedProfile;
}

// ─── Audio constants ──────────────────────────────────────────────────────────

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.8-live';
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-2';
const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? 8000);
const GEMINI_INPUT_SAMPLE_RATE = 16000;  // Gemini Live expects 16 kHz input
const GEMINI_OUTPUT_SAMPLE_RATE = 24000; // Gemini Live outputs 24 kHz

const EXOTEL_SAMPLE_RATE = parseInt(process.env.EXOTEL_SAMPLE_RATE ?? '8000', 10);

// Exotel chunk size: multiples of 320 bytes, target ~100ms
// 8 kHz 16-bit: 100ms = 8000 * 0.1 * 2 = 1600 bytes = 5 × 320
// 16 kHz 16-bit: 100ms = 16000 * 0.1 * 2 = 3200 bytes = 10 × 320
const EXOTEL_CHUNK_BYTES = EXOTEL_SAMPLE_RATE === 16000 ? 3200 : 1600;

// Session-level constants — precomputed so resamplePcm16 never divides per chunk
const EXOTEL_TO_GEMINI_RATIO = EXOTEL_SAMPLE_RATE / GEMINI_INPUT_SAMPLE_RATE;
const GEMINI_TO_EXOTEL_RATIO = GEMINI_OUTPUT_SAMPLE_RATE / EXOTEL_SAMPLE_RATE;

// Bounded buffer for caller audio that arrives while Gemini is still connecting.
// ~2 seconds of 16-bit PCM — enough to cover connect latency without growing
// without limit if Gemini never comes up.
const MAX_PENDING_INPUT_BYTES = EXOTEL_SAMPLE_RATE * 2 * 2;

// ─── Audio resampling ─────────────────────────────────────────────────────────

/**
 * Linear-interpolation resampler for raw PCM16 LE mono buffers.
 *
 * @param {Buffer} input     Raw PCM16 LE mono samples
 * @param {number} ratio     inRate / outRate (precomputed per session)
 * @returns {Buffer}         Resampled PCM16 LE mono samples
 */
function resamplePcm16(input, ratio) {
  if (ratio === 1 || input.length < 4) return input;

  const inSamples = input.length / 2; // 2 bytes per int16
  const outSamples = Math.round(inSamples / ratio);
  const out = Buffer.allocUnsafe(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;

    const s0 = input.readInt16LE(Math.min(srcIdx, inSamples - 1) * 2);
    const s1 = input.readInt16LE(Math.min(srcIdx + 1, inSamples - 1) * 2);
    const interpolated = Math.round(s0 + frac * (s1 - s0));

    out.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
  }

  return out;
}

// ─── CallSession ──────────────────────────────────────────────────────────────

class CallSession {
  /**
   * @param {string} callSid
   * @param {string} streamSid
   * @param {WebSocket} exotelWs
   * @param {import('@google/genai').GoogleGenAI} ai
   * @param {object} companyProfile
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
    
    /** Accumulator for Exotel input audio before chunking to Gemini */
    this.inputBuffer = Buffer.alloc(0);

    // Call reporting state
    this.startedAt = new Date().toISOString();
    this.transcript = [];
    this.bookingIds = [];
    this.knowledgeQueries = [];
    this.outcome = 'answered';
    this.intent = null;
    this.caller = 'Unknown caller';
    this.phone = null;
    this.callRecordId = `call-${callSid}`;
    this.closed = false;

    // Gemini readiness + bounded pre-connect audio buffer
    this.geminiOpen = false;
    this.pendingInput = Buffer.alloc(0);

    // Barge-in bookkeeping (one clear frame per interrupted turn)
    this.interruptSent = false;

    // Per-call booking idempotency: booking key -> Promise<appointment entry>
    this.bookingPromises = new Map();

    // DB `calls.id`, created in the background at call start so appointments
    // can reference it before the call ends.
    this.callId = null;
    this.callIdPromise = null;

    // Rate-limit repeated media-packet errors so one bad stream can't flood logs
    this.mediaErrorCount = 0;
    this.mediaErrorLoggedAt = 0;
  }

  log(...args) { console.log(`[bridge][${this.callSid}]`, ...args); }
  err(...args) { console.error(`[bridge][${this.callSid}]`, ...args); }

  /** sendToolResponse guarded against a closed/absent Gemini session. */
  _sendToolResponse(fc, response) {
    if (this.closed || !this.geminiSession) return;
    try {
      this.geminiSession.sendToolResponse({
        functionResponses: { id: fc.id, name: fc.name, response },
      });
    } catch (e) {
      this.err('Error sending tool response:', e);
    }
  }

  /** Rate-limited media error logging (max one line per 5s per call). */
  _mediaError(stage, error) {
    this.mediaErrorCount++;
    const now = Date.now();
    if (now - this.mediaErrorLoggedAt < 5000) return;
    this.mediaErrorLoggedAt = now;
    this.err(`Media ${stage} error (x${this.mediaErrorCount}):`, error?.message ?? error);
    this.mediaErrorCount = 0;
  }

  /**
   * Returns the DB `calls.id`, creating the row once. Started in the background
   * at call start; only awaited off the audio path (e.g. before booking).
   */
  ensureCallRecord() {
    if (this.callId) return Promise.resolve(this.callId);
    if (!this.callIdPromise) {
      this.callIdPromise = upsertCallRecord(this._startRecord())
        .then((id) => { this.callId = id; return id; })
        .catch((e) => { this.err('Failed to create call record:', e?.message ?? e); return null; });
    }
    return this.callIdPromise;
  }

  /** Minimal call row persisted at call start (final fields written on close). */
  _startRecord() {
    return {
      id: this.callRecordId,
      callSid: this.callSid,
      caller: this.caller,
      phone: this.phone,
      channel: 'phone',
      startedAt: this.startedAt,
      endedAt: null,
      durationSec: 0,
      outcome: 'answered',
      intent: null,
      summary: null,
      sentiment: 'neutral',
      transcript: [],
      bookingIds: [],
      knowledgeQueries: [],
    };
  }

  /** Append a transcript turn, merging consecutive same-speaker turns. */
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
        ? this.transcript.slice(0, 4).map((t) => `${t.role === 'caller' ? 'Caller' : 'Maya'}: ${t.text}`).join(' ')
        : null,
      sentiment: 'neutral',
      transcript: this.transcript,
      bookingIds: this.bookingIds,
      knowledgeQueries: this.knowledgeQueries,
    };
  }

  /** Open a Gemini Live session for this phone call. */
  async openGeminiSession() {
    const { voiceName, pitch, speed } = resolveVoiceSettings();
    const systemInstruction = buildSystemInstruction(this.companyProfile, { pitch, speed });

    this.log(`Connecting to Gemini Live (model: ${GEMINI_MODEL}, voice: ${voiceName})`);

    const doneConnect = timer('gemini-live-connect');
    const sessionPromise = this.ai.live.connect({
      model: GEMINI_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        systemInstruction,
        tools: buildTools(),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          doneConnect();
          this.log('Gemini Live session opened');
          sessionPromise
            .then((session) => {
              if (this.closed) return;
              try {
                session.sendClientContent({
                  turns: [{ role: 'user', parts: [{ text: `System command: Greet the caller with: "${buildGreeting(this.companyProfile)}"` }] }],
                  turnComplete: true,
                });
              } catch (e) {
                this.err('Failed to send greeting:', e);
              }
            })
            .catch((e) => this.err('Gemini session promise rejected:', e));
        },
        onmessage: (message) => {
          if (this.closed) return;
          this._handleGeminiMessage(message).catch((e) =>
            this.err('Error in _handleGeminiMessage:', e),
          );
        },
        onerror: (err) => {
          this.err('Gemini Live error:', err?.message ?? err);
        },
        onclose: (evt) => {
          this.geminiOpen = false;
          this.log('Gemini Live session closed', evt?.code, evt?.reason);
        },
      },
    });

    const session = await sessionPromise;
    if (this.closed) {
      // The call ended while Gemini was connecting — don't retain the session.
      try { session.close(); } catch { /* already closed */ }
      return;
    }
    this.geminiSession = session;
    this.geminiOpen = true;
    this.log('Gemini Live session ready');

    // Flush any caller audio captured while Gemini was connecting.
    this._flushPendingInput();
  }

  /**
   * Handle an Exotel audio media chunk — hot path, no awaits allowed.
   * Decodes base64 once, buffers to 100ms chunks, resamples, forwards to Gemini.
   * @param {string} base64Payload  Base64-encoded PCM16 @ EXOTEL_SAMPLE_RATE
   */
  handleExotelMedia(base64Payload) {
    if (this.closed) return;

    let rawPcm;
    try {
      rawPcm = Buffer.from(base64Payload, 'base64');
    } catch (e) {
      this._mediaError('decode', e);
      return;
    }
    if (rawPcm.length === 0) return;

    // Gemini is still connecting: keep a small, bounded slice of caller audio
    // so the first words aren't lost. Drop the oldest audio on overflow.
    if (!this.geminiOpen || !this.geminiSession) {
      this.pendingInput = Buffer.concat([this.pendingInput, rawPcm]);
      if (this.pendingInput.length > MAX_PENDING_INPUT_BYTES) {
        this.pendingInput = this.pendingInput.subarray(
          this.pendingInput.length - MAX_PENDING_INPUT_BYTES,
        );
      }
      return;
    }

    try {
      this._ingestInput(rawPcm);
    } catch (e) {
      this._mediaError('forward', e);
    }
  }

  /** Chunk + resample raw caller PCM and forward to Gemini. Hot path. */
  _ingestInput(rawPcm) {
    this.inputBuffer = Buffer.concat([this.inputBuffer, rawPcm]);

    // Buffer to exactly 100ms chunks to avoid spamming the Gemini API with tiny
    // frames, which causes network queuing and hurts VAD latency.
    while (this.inputBuffer.length >= EXOTEL_CHUNK_BYTES) {
      const chunk = this.inputBuffer.subarray(0, EXOTEL_CHUNK_BYTES);
      this.inputBuffer = this.inputBuffer.subarray(EXOTEL_CHUNK_BYTES);

      const rawGemini = EXOTEL_TO_GEMINI_RATIO === 1
        ? chunk
        : resamplePcm16(chunk, EXOTEL_TO_GEMINI_RATIO);

      this.geminiSession.sendRealtimeInput({
        media: { data: rawGemini.toString('base64'), mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}` },
      });
    }
  }

  /** Forward audio buffered while Gemini was connecting. */
  _flushPendingInput() {
    if (!this.pendingInput.length || !this.geminiSession) return;
    const buffered = this.pendingInput;
    this.pendingInput = Buffer.alloc(0);
    this._ingestInput(buffered);
  }

  /** @param {import('@google/genai').LiveServerMessage} message */
  async _handleGeminiMessage(message) {
    if (this.closed) return;
    const serverContent = message.serverContent;

    // Transcripts (in-memory only)
    const inputTranscript = serverContent?.inputTranscription?.text;
    if (inputTranscript) this.addTranscript('caller', inputTranscript);
    const outputTranscript = serverContent?.outputTranscription?.text;
    if (outputTranscript) this.addTranscript('maya', outputTranscript);

    // Barge-in takes priority — never play stale audio for an interrupted turn.
    if (serverContent?.interrupted) {
      this._handleInterrupt();
    } else {
      this._forwardModelAudio(serverContent);
    }

    // Force-flush the tail of a turn so final (<chunk) audio isn't stuck.
    if (serverContent?.turnComplete || serverContent?.generationComplete) {
      this._flushOutputBuffer(true);
      this.interruptSent = false;
    }

    // Tool calls run off the audio path; each sends its own response when ready.
    const functionCalls = message.toolCall?.functionCalls;
    if (functionCalls?.length) {
      for (const fc of functionCalls) void this._handleToolCall(fc);
    }

    if (message.toolCallCancellation?.ids?.length) {
      this.log('Tool call cancelled by Gemini:', message.toolCallCancellation.ids.join(','));
    }
  }

  /** Forward every inline-audio part of a model turn to Exotel. */
  _forwardModelAudio(serverContent) {
    const parts = serverContent?.modelTurn?.parts;
    if (!parts?.length) return;

    for (const part of parts) {
      const data = part?.inlineData?.data;
      if (!data) continue;
      try {
        let rawGemini = Buffer.from(data, 'base64');
        if (rawGemini.length < 2) continue;
        if (rawGemini.length % 2 !== 0) rawGemini = rawGemini.subarray(0, rawGemini.length - 1);

        const rawExotel = GEMINI_TO_EXOTEL_RATIO === 1
          ? rawGemini
          : resamplePcm16(rawGemini, GEMINI_TO_EXOTEL_RATIO);

        this.outputBuffer = Buffer.concat([this.outputBuffer, rawExotel]);
      } catch (e) {
        this._mediaError('output', e);
      }
    }

    this._flushOutputBuffer();
  }

  /** Clear queued Exotel playback once per interrupted turn. */
  _handleInterrupt() {
    this.outputBuffer = Buffer.alloc(0);
    if (this.interruptSent) return;
    this.interruptSent = true;
    this.log('Barge-in — clearing Exotel playback buffer');
    this._sendExotelFrame({ event: 'clear', streamSid: this.streamSid });
  }

  /** @param {{ id: string, name: string, args?: object }} fc */
  async _handleToolCall(fc) {
    try {
      if (fc.name === 'bookAppointment') {
        await this._handleBookAppointment(fc);
      } else if (fc.name === 'searchKnowledgeBase') {
        await this._handleSearchKnowledge(fc);
      } else {
        this.log(`Unknown tool call: ${fc.name}`);
        this._sendToolResponse(fc, { result: 'OK' });
      }
    } catch (e) {
      this.err(`Tool "${fc?.name}" failed:`, e);
      this._sendToolResponse(fc, { result: 'This action could not be completed right now.' });
    }
  }

  async _handleBookAppointment(fc) {
    const args = fc.args ?? {};
    if (!args.customerName || !args.date || !args.time) {
      this._sendToolResponse(fc, {
        result: 'Missing booking details. Ask the caller for their name, preferred date and time.',
      });
      return;
    }

    const key = `${args.customerName}|${args.date}|${args.time}`.toLowerCase();
    let result;

    try {
      // Idempotency: duplicate/concurrent calls for the same slot share one insert.
      let booking = this.bookingPromises.get(key);
      if (!booking) {
        booking = (async () => {
          const callId = await this.ensureCallRecord();
          const doneDb = timer('db-persist-appointment');
          const entry = await persistAppointment(this.callSid, args, callId);
          doneDb();
          return entry;
        })();
        this.bookingPromises.set(key, booking);
      }

      const entry = await booking;
      if (!this.bookingIds.includes(entry.id)) this.bookingIds.push(entry.id);
      this.outcome = 'booked';
      this.intent = args.reason || 'Appointment booking';
      this.caller = args.customerName || this.caller;
      result = { result: `Appointment booked successfully. ID: ${entry.id}` };
    } catch (e) {
      this.err('Error persisting appointment:', e);
      this.bookingPromises.delete(key); // allow a clean retry
      result = { result: 'Appointment booking recorded (storage error, please confirm manually).' };
    }

    // Respond to Gemini FIRST so Maya can keep talking immediately.
    this._sendToolResponse(fc, result);

    // CRM sync + audit in the background — never blocks audio.
    if (getCrmProvider() !== 'none' && result.result.includes('successfully')) {
      runBackground('crm-book', async () => {
        const sync = await syncToCrm({
          contact: { name: args.customerName, phone: this.phone, source: 'phone' },
          call: { callSid: this.callSid, intent: this.intent, outcome: 'booked' },
          appointment: { date: args.date, time: args.time, reason: args.reason, status: 'confirmed' },
          company: this.companyProfile,
        });
        await logCrmSyncEvent({
          callSid: this.callSid,
          provider: sync.provider,
          status: sync.ok ? 'success' : 'failed',
          error: sync.error,
        });
      });
    }
  }

  async _handleSearchKnowledge(fc) {
    const query = (fc.args?.query ?? '').trim();
    let result = [];
    if (!query) {
      this._sendToolResponse(fc, { result });
      return;
    }

    try {
      this.knowledgeQueries.push(query);
      if (!this.intent) this.intent = query;

      const doneEmbed = timer('gemini-embed-query');
      const response = await withTimeout(
        this.ai.models.embedContent({ model: EMBEDDING_MODEL, contents: query }),
        EMBED_TIMEOUT_MS,
        'embedContent',
      );
      doneEmbed();

      const queryVector = response.embeddings?.[0]?.values;
      if (queryVector?.length) {
        const doneSearch = timer('pgvector-search');
        result = await searchKnowledgeEmbeddings(`[${queryVector.join(',')}]`, 3);
        doneSearch();
      }
    } catch (e) {
      this.err('Error searching knowledge base:', e);
    }

    this._sendToolResponse(fc, { result });
  }

  /** Flush accumulated Gemini output in valid Exotel chunk sizes (multiples of 320 bytes). */
  _flushOutputBuffer(force = false) {
    while (this.outputBuffer.length >= EXOTEL_CHUNK_BYTES) {
      const chunk = this.outputBuffer.subarray(0, EXOTEL_CHUNK_BYTES);
      this.outputBuffer = this.outputBuffer.subarray(EXOTEL_CHUNK_BYTES);
      this._sendMediaToExotel(chunk);
    }

    if (force && this.outputBuffer.length > 0) {
      const remainder = this.outputBuffer.length % 320;
      const padded = remainder === 0
        ? this.outputBuffer
        : Buffer.concat([this.outputBuffer, Buffer.alloc(320 - remainder)]);
      this._sendMediaToExotel(padded);
      this.outputBuffer = Buffer.alloc(0);
    }
  }

  /** @param {Buffer} pcm16Buf */
  _sendMediaToExotel(pcm16Buf) {
    this._sendExotelFrame({
      event: 'media',
      streamSid: this.streamSid,
      media: { payload: pcm16Buf.toString('base64') },
    });
  }

  /** @param {object} frame */
  _sendExotelFrame(frame) {
    if (this.exotelWs.readyState !== 1 /* OPEN */) return;
    try {
      this.exotelWs.send(JSON.stringify(frame));
    } catch (e) {
      this.err('Error sending frame to Exotel:', e);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.geminiOpen = false;
    this.pendingInput = Buffer.alloc(0);
    this.log('Closing call session');

    this._flushOutputBuffer(true);

    if (this.geminiSession) {
      try { this.geminiSession.close(); } catch (e) { this.err('Error closing Gemini session:', e); }
      this.geminiSession = null;
    }

    try {
      if (this.outcome === 'answered' && this.transcript.length === 0) {
        this.outcome = 'missed';
      }
      const record = this.buildCallRecord();
      const doneDb = timer('db-upsert-call-record');
      await upsertCallRecord(record);
      doneDb();
      this.log(`Call record saved (${record.outcome}, ${record.transcript.length} turns)`);

      if (getCrmProvider() !== 'none') {
        runBackground('crm-close', async () => {
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
        });
      }
    } catch (e) {
      this.err('Error persisting call record:', e);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate required env vars
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      '[bridge] FATAL: GEMINI_API_KEY environment variable is not set.\n' +
        '  Set it in .env (for dev) or your Render environment variables.\n' +
        '  Do NOT use NEXT_PUBLIC_GOOGLE_API_KEY — that key is exposed client-side.',
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      '[bridge] FATAL: DATABASE_URL is not set.\n' +
        '  Use the Neon POOLED (PgBouncer) connection string, not the direct endpoint.',
    );
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Warm the profile cache at startup so the first call doesn't pay the load cost.
  let companyProfile;
  try {
    companyProfile = await getCompanyProfile();
  } catch (error) {
    console.error('[bridge] FATAL: Could not load company profile from Postgres:', error.message);
    process.exit(1);
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);

  // ── HTTP server ────────────────────────────────────────────────────────────
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0];

    // Lightweight keep-alive probe (no DB query, fast plain-text response)
    if ((req.method === 'GET' || req.method === 'HEAD') && url === '/ping') {
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end('pong');
      return;
    }

    if (req.method === 'GET' && url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'keralai-bridge' }));
      return;
    }

    if (req.method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('KeralaI bridge is running');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  // ── WebSocket servers ──────────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true });
  const browserWss = new WebSocketServer({ noServer: true });
  const browserSessionsByIp = new Map();
  const maxBrowserSessionsPerIp = Number(process.env.BROWSER_MAX_SESSIONS_PER_IP ?? 3);

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/ws/exotel') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } else if (url.pathname === '/ws/browser') {
      const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
      const origin = req.headers.origin;
      const ip = req.socket.remoteAddress ?? 'unknown';
      const activeSessions = browserSessionsByIp.get(ip) ?? 0;

      if (configuredOrigin && origin && origin !== configuredOrigin) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      if (activeSessions >= maxBrowserSessionsPerIp) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\n\r\n');
        socket.destroy();
        return;
      }

      browserSessionsByIp.set(ip, activeSessions + 1);
      browserWss.handleUpgrade(req, socket, head, (ws) => {
        ws._keralaiIp = ip;
        browserWss.emit('connection', ws, req);
      });
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  // ── Browser relay handler ──────────────────────────────────────────────────
  browserWss.on('connection', (ws, req) => {
    console.log('[bridge] New browser voice session from', req.socket.remoteAddress);

    // Each call refreshes the cached profile (cheap TTL check)
    getCompanyProfile().then((profile) => {
      const session = new BrowserSession(
        ws, ai, profile,
        buildSystemInstruction, buildTools, buildGreeting,
      );

      const sessionTtl = setTimeout(() => {
        session.send({ type: 'error', message: 'This demo session has reached its time limit.' });
        session.close().finally(() => ws.close(1000, 'Session TTL reached'));
      }, Number(process.env.BROWSER_SESSION_TTL_MS ?? 15 * 60 * 1000));

      ws.on('message', async (raw) => {
        let frame;
        try { frame = JSON.parse(raw.toString()); } catch {
          ws.close(1003, 'JSON frames required'); return;
        }
        try {
          if (frame.type === 'start') await session.open(frame);
          else if (frame.type === 'audio') session.sendAudio(frame.data, frame.mimeType);
          else if (frame.type === 'stop') { await session.close(); ws.close(1000, 'Session complete'); }
        } catch (error) {
          console.error('[bridge][browser] frame failed:', error);
          session.send({ type: 'error', message: 'Unable to start the voice session.' });
          await session.close();
        }
      });

      ws.on('close', () => {
        clearTimeout(sessionTtl);
        const ip = ws._keralaiIp;
        const count = browserSessionsByIp.get(ip) ?? 1;
        if (count <= 1) browserSessionsByIp.delete(ip);
        else browserSessionsByIp.set(ip, count - 1);
        session.close().catch((e) => console.error('[bridge][browser] close failed:', e));
      });

      ws.on('error', (e) => console.error('[bridge][browser] WebSocket error:', e));
    }).catch((e) => {
      console.error('[bridge][browser] Failed to load profile:', e);
      ws.close(1011, 'Profile load failed');
    });
  });

  // ── Exotel handler ─────────────────────────────────────────────────────────
  wss.on('connection', (ws, req) => {
    console.log('[bridge] New Exotel WebSocket connection from', req.socket.remoteAddress);

    /** @type {CallSession | null} */
    let session = null;

    ws.on('message', async (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString()); } catch {
        console.warn('[bridge] Received non-JSON WebSocket frame — ignoring'); return;
      }

      switch (frame.event) {
        case 'connected':
          console.log('[bridge] Exotel connected event received');
          break;

        case 'start': {
          const startMeta = frame.start ?? frame;
          const callSid =
            frame.call_sid ?? frame.callSid ??
            startMeta.call_sid ?? startMeta.callSid ??
            startMeta.call?.sid ?? 'unknown';
          const streamSid =
            frame.stream_sid ?? frame.streamSid ??
            startMeta.stream_sid ?? startMeta.streamSid ??
            startMeta.stream?.sid ?? 'unknown';

          console.log(`[bridge] Call started — callSid=${callSid}, streamSid=${streamSid}`);

          if (session) { console.warn('[bridge] Duplicate start event — ignoring'); break; }

          // Create the session synchronously (before any await) so concurrent
          // 'start'/'media'/'stop' events always observe it.
          const created = new CallSession(callSid, streamSid, ws, ai, companyProfile);
          session = created;
          created.caller = startMeta.from ?? startMeta.caller ?? startMeta.custom_parameters?.caller ?? 'Unknown caller';
          created.phone = startMeta.from ?? startMeta.custom_parameters?.phone ?? null;

          // Best-effort profile refresh (TTL-cached; falls back to startup value).
          try { created.companyProfile = await getCompanyProfile(); }
          catch { /* keep startup profile */ }

          // Create the DB calls row in the background so bookings can reference
          // it even though the call is still in progress.
          void created.ensureCallRecord();

          // A 'stop' may have arrived while we awaited — don't connect Gemini.
          if (created.closed) break;

          try {
            await created.openGeminiSession();
          } catch (e) {
            console.error(`[bridge][${callSid}] Failed to open Gemini session:`, e);
            if (session === created) session = null;
            if (ws.readyState === 1) ws.close(1011, 'Gemini session failed to open');
          }
          break;
        }

        case 'media': {
          // Media before 'start' (or after 'stop') is ignored quietly — never
          // log per packet.
          if (!session) break;
          const payload = frame.media?.payload;
          if (payload) session.handleExotelMedia(payload);
          break;
        }

        case 'dtmf':
          if (session) session.log('DTMF event (ignored):', frame);
          break;

        case 'stop':
          console.log('[bridge] Exotel stop event — closing session');
          if (session) { await session.close(); session = null; }
          break;

        default:
          console.log('[bridge] Unknown Exotel event:', frame.event);
      }
    });

    ws.on('close', async (code, reason) => {
      console.log(`[bridge] Exotel WebSocket closed (code=${code}, reason=${reason})`);
      if (session) { await session.close(); session = null; }
    });

    ws.on('error', (err) => console.error('[bridge] Exotel WebSocket error:', err));
  });

  // ── Start listening ────────────────────────────────────────────────────────
  server.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  KeralaI Bridge — Standalone Exotel ↔ Gemini Live           ║
╠══════════════════════════════════════════════════════════════╣
║  Health check :  http://localhost:${port}/health              ║
║  Exotel WS   :  ws://localhost:${port}/ws/exotel              ║
║  Browser WS  :  ws://localhost:${port}/ws/browser             ║
║                                                              ║
║  Exotel rate : ${EXOTEL_SAMPLE_RATE} Hz                                ║
║  Gemini in   : ${GEMINI_INPUT_SAMPLE_RATE} Hz                              ║
║  Gemini out  : ${GEMINI_OUTPUT_SAMPLE_RATE} Hz                              ║
║  Profile TTL : ${PROFILE_TTL_MS / 1000}s                              ║
║  CRM         : ${getCrmProvider()}                                  ║
║  DEBUG_TIMING: ${debugTiming ? 'ON' : 'off'}                                ║
╚══════════════════════════════════════════════════════════════╝
`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[bridge] ${signal} received — shutting down gracefully…`);

    const forceExit = setTimeout(() => {
      console.error('[bridge] Shutdown timed out — forcing exit.');
      process.exit(1);
    }, 10_000);

    // Stop accepting connections and release live WebSocket clients.
    for (const client of wss.clients) { try { client.close(1001, 'Server shutting down'); } catch { /* ignore */ } }
    for (const client of browserWss.clients) { try { client.close(1001, 'Server shutting down'); } catch { /* ignore */ } }

    server.close(async () => {
      try { await drainBackground(3000); } catch { /* ignore */ }
      try { await closePool(); } catch (e) { console.error('[bridge] Error closing pool:', e.message); }
      clearTimeout(forceExit);
      console.log('[bridge] Shutdown complete.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Never let a stray rejection from background work take the process down.
  process.on('unhandledRejection', (reason) => {
    console.error('[bridge] Unhandled promise rejection:', reason?.message ?? reason);
  });
}

main().catch((err) => {
  console.error('[bridge] Fatal startup error:', err);
  process.exit(1);
});