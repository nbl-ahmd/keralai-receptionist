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
 *   GET  /metrics         — Aggregate latency/throughput snapshot (JSON, no PII)
 *   WS   /ws/exotel/:slug — Exotel phone bridge (PCM audio ↔ Gemini Live)
 *   WS   /ws/browser      — Browser voice relay (audio ↔ Gemini Live)
 *
 * Required env vars:
 *   DATABASE_URL          — Neon POOLED (PgBouncer) connection string
 *   BRIDGE_AUTH_SECRET    — Shared with the dashboard; verifies browser tokens
 *   TENANT_SECRETS_ENCRYPTION_KEY — Same master key as the dashboard
 *
 * Optional env vars:
 *   PORT                  — HTTP port (Render injects this automatically)
 *   EXOTEL_SAMPLE_RATE    — 8000 or 16000 (default 8000)
 *   GEMINI_MODEL          — Fallback Live model when a tenant has no override
 *   GEMINI_EMBEDDING_MODEL — Fallback embedding model
 *   MAYA_VOICE            — Gemini voice name (default Aoede)
 *   MAYA_PITCH            — Low | Normal | High (default Normal)
 *   MAYA_SPEED            — Slow | Normal | Fast (default Normal)
 *   MAYA_GREETING         — "0" disables the server greeting (use when an
 *                           Exotel greeting/IVR applet greets the caller). Default on.
 *   PUBLIC_APP_ORIGIN     — Exact browser origin allowed for /ws/browser
 *   BROWSER_MAX_SESSIONS_PER_IP — Per-IP limit for /ws/browser (default 3)
 *   BROWSER_SESSION_TTL_MS      — Max browser session duration in ms (default 900000)
 *   PG_POOL_MAX           — Postgres pool size (default 10)
 *   PG_QUERY_TIMEOUT_MS   — Per-query timeout in ms (default 15000)
 *   CRM_TIMEOUT_MS        — CRM webhook timeout in ms (default 8000)
 *   EMBED_TIMEOUT_MS      — Embedding request timeout in ms (default 8000)
 *   BARGE_IN_MUTE_MS      — Barge-in audio-mute watchdog in ms (default 2000)
 *   DEBUG_TIMING          — Set to "1" to log per-phase latency for key operations
 *   LATENCY_LOG           — "0" disables [perf] aggregate logging (default on)
 *   LATENCY_LOG_INTERVAL_MS — Per-call summary interval in ms (default 30000; 0 = off)
 *   VERBOSE_AUDIO_LOG     — "1" logs every audio chunk (noisy; default off)
 *   SLOW_DB_MS            — Warn for DB queries slower than this (default 250)
 *   METRICS_ENABLED       — "0" disables GET /metrics (default on)
 *   METRICS_TOKEN         — If set, /metrics requires ?token= or x-metrics-token
 */

import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

import { WebSocketServer } from 'ws';
import { Modality } from '@google/genai';

import {
  closePool,
  getLegacyTenant,
  getProfileVersion,
  getTenantBridgeCredential,
  getTenantById,
  getTenantBySlug,
  getTenantRuntimeState,
  loadActiveInstructions,
  loadCompanyProfile,
  logCrmSyncEvent,
  persistAppointment,
  persistCallbackRequest,
  persistCallLog,
  persistMessage,
  persistQuoteRequest,
  searchKnowledgeEmbeddings,
  upsertCallMetrics,
  upsertCallRecord,
} from './db.mjs';
import { getCrmProvider, syncToCrm } from './crm.mjs';
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_LIVE_MODEL,
  getTenantEmbeddingModel,
  getTenantGeminiApiKey,
  getTenantGeminiClient,
  getTenantLiveModel,
  importLegacyGeminiKeyIfNeeded,
} from './gemini.mjs';
import { verifyBridgeToken, verifyExotelToken } from './bridge-token.mjs';
import { getSecretsKeyFingerprint } from './secrets.mjs';
import { auditTenantGeminiKeys } from './secrets.mjs';
import { BrowserSession } from './browser-session.mjs';
import { buildRuntimeInstruction } from './shared/runtime-modes.mjs';
import {
  CallMetrics,
  LATENCY_LOG_INTERVAL_MS,
  hrNow,
  latencyLogEnabled,
  logCallStats,
  logPerf,
  msSince,
  processMetrics,
  snapshotProcess,
  verboseAudio,
} from './metrics.mjs';
import {
  buildGreeting,
  buildSystemInstruction,
  buildTools,
  isGreetingEnabled,
  resolveLiveAudioSettings,
  resolveVoiceSettings,
} from './shared/maya-config.mjs';

// Server-side opening greeting. Disable with MAYA_GREETING=0 when an Exotel
// greeting/IVR applet already greets the caller.
const GREETING_ENABLED = isGreetingEnabled();

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
  const startedNs = hrNow();
  const duringCall = processMetrics.activeCalls > 0;
  processMetrics.backgroundTasks++;
  const task = (async () => {
    try {
      await fn();
      logPerf('bg', {
        task: label,
        dur_ms: msSince(startedNs).toFixed(1),
        ok: 1,
        during_call: duringCall ? 1 : 0,
      });
    } catch (error) {
      processMetrics.backgroundFailures++;
      console.error(`[bridge][bg:${label}] failed:`, error?.message ?? error);
      logPerf('bg', {
        task: label,
        dur_ms: msSince(startedNs).toFixed(1),
        ok: 0,
        during_call: duringCall ? 1 : 0,
      });
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

// ─── Company profile cache (per tenant, TTL + version-check) ──────────────────
//
// Each tenant has its own cached profile so a change to one workspace never
// affects another. `updated_at` is checked cheaply before a full reload.
const PROFILE_TTL_MS = Number(process.env.PROFILE_CACHE_TTL_MS ?? 5 * 60 * 1000); // 5 min default

/**
 * @typedef {{
 *   profile: object,
 *   updatedAt: string | null,
 *   lastCheck: number,
 *   refreshing: boolean,
 * }} TenantProfileCacheEntry
 */

/** @type {Map<string, TenantProfileCacheEntry>} */
const _profileCache = new Map();

function getProfileCacheEntry(tenantId) {
  let entry = _profileCache.get(tenantId);
  if (!entry) {
    entry = { profile: null, updatedAt: null, lastCheck: 0, refreshing: false };
    _profileCache.set(tenantId, entry);
  }
  return entry;
}

/** Loads/refreshes one tenant's profile from the DB. */
async function refreshCompanyProfile(tenantId) {
  const entry = getProfileCacheEntry(tenantId);

  const doneVersion = timer('profile-version-check');
  const version = await getProfileVersion(tenantId);
  doneVersion();

  const versionStr = version ? new Date(version).toISOString() : null;
  if (entry.profile && versionStr === entry.updatedAt) {
    return entry.profile; // unchanged — skip the full load
  }

  const doneLoad = timer('profile-full-load');
  const profile = await loadCompanyProfile(tenantId);
  doneLoad();
  entry.profile = profile;
  entry.updatedAt = versionStr;

  console.log(`[bridge] Company profile loaded/refreshed for tenant ${tenantId}: "${profile.name || '(unnamed)'}"`);
  return profile;
}

/** Refresh without awaiting — errors are contained (never an unhandled rejection). */
function refreshCompanyProfileInBackground(tenantId) {
  const entry = getProfileCacheEntry(tenantId);
  if (entry.refreshing) return;
  entry.refreshing = true;
  refreshCompanyProfile(tenantId)
    .catch((e) => console.error('[bridge] Background profile refresh failed:', e?.message ?? e))
    .finally(() => { entry.refreshing = false; });
}

/**
 * Returns one tenant's company profile (which carries the dashboard-controlled
 * voice and greeting settings).
 *
 * `force: true` awaits a version check so dashboard changes apply to the very
 * next call; otherwise the cached value is returned and a refresh runs in the
 * background once the TTL expires.
 *
 * @param {string} tenantId
 * @param {{ force?: boolean }} [options]
 */
async function getCompanyProfile(tenantId, { force = false } = {}) {
  const entry = getProfileCacheEntry(tenantId);
  const now = Date.now();

  if (!entry.profile) {
    entry.lastCheck = now;
    return refreshCompanyProfile(tenantId);
  }

  if (force) {
    entry.lastCheck = now;
    try {
      return await refreshCompanyProfile(tenantId);
    } catch (e) {
      console.error('[bridge] Profile refresh failed:', e?.message ?? e);
      return entry.profile;
    }
  }

  if ((now - entry.lastCheck) >= PROFILE_TTL_MS) {
    entry.lastCheck = now;
    refreshCompanyProfileInBackground(tenantId);
  }
  return entry.profile;
}

// ─── Audio constants ──────────────────────────────────────────────────────────

// Per-tenant overrides are resolved at session start; these are fallbacks only.
const GEMINI_MODEL = DEFAULT_LIVE_MODEL;
const EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;
const EMBED_TIMEOUT_MS = Number(process.env.EMBED_TIMEOUT_MS ?? 8000);
const GEMINI_INPUT_SAMPLE_RATE = 16000;  // Gemini Live expects 16 kHz input
const GEMINI_OUTPUT_SAMPLE_RATE = 24000; // Gemini Live outputs 24 kHz

const EXOTEL_SAMPLE_RATE = parseInt(process.env.EXOTEL_SAMPLE_RATE ?? '8000', 10);

// The Exotel Voicebot applet can be configured at 8000/16000/24000 Hz via the
// WebSocket URL (?sample-rate=) and reports it in `start.media_format.sample_rate`.
// The bridge must resample using the ACTUAL call rate or caller audio is garbled.
const DEFAULT_EXOTEL_RATE =
  EXOTEL_SAMPLE_RATE === 16000 || EXOTEL_SAMPLE_RATE === 24000 || EXOTEL_SAMPLE_RATE === 8000
    ? EXOTEL_SAMPLE_RATE
    : 8000;

/** Coerce a value to a supported Exotel rate, or null. */
function normalizeExotelRate(value) {
  const rate = Number(value);
  return rate === 8000 || rate === 16000 || rate === 24000 ? rate : null;
}

// 100 ms of PCM16 at `rate` bytes; always a multiple of 320 (Exotel requirement).
function exotelChunkBytes(rate) {
  return Math.round(rate / 5);
}

// Safety net: if Gemini doesn't send `turnComplete` after an interruption, stop
// muting model audio after this long so the call can't go permanently silent.
const BARGE_IN_MUTE_MS = Number(process.env.BARGE_IN_MUTE_MS ?? 2000);

// ─── Audio resampling ─────────────────────────────────────────────────────────

/**
 * Linear-interpolation resampler for raw PCM16 LE mono buffers.
 *
 * @param {Buffer} input     Raw PCM16 LE mono samples
 * @param {number} ratio     inRate / outRate (precomputed per session)
 * @returns {Buffer}         Resampled PCM16 LE mono samples
 */
function resamplePcm16(input, ratio) {
  if (ratio === 1) return input;
  if (input.length % 2 !== 0) input = input.subarray(0, input.length - 1);
  if (input.length < 4) return input;

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
   * @param {'streamSid'|'stream_sid'} streamKey  Outbound field name to match
   *   whichever convention this Exotel/Twilio-compatible stream used inbound.
   * @param {WebSocket} exotelWs
   * @param {import('@google/genai').GoogleGenAI} ai
   * @param {object} companyProfile
   * @param {number} exotelRate  Actual call sample rate (8000/16000/24000)
   * @param {{ tenantId: string, liveModel: string, embeddingModel: string }} tenant
   */
  constructor(callSid, streamSid, streamKey, exotelWs, ai, companyProfile, exotelRate, tenant) {
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.streamKey = streamKey === 'stream_sid' ? 'stream_sid' : 'streamSid';
    this.exotelWs = exotelWs;
    this.ai = ai;
    this.companyProfile = companyProfile;
    this.tenantId = tenant.tenantId;
    this.liveModel = tenant.liveModel;
    this.embeddingModel = tenant.embeddingModel;

    // Per-call audio math (precomputed once so the hot path never divides).
    this.exotelRate = normalizeExotelRate(exotelRate) ?? DEFAULT_EXOTEL_RATE;
    this.toGeminiRatio = this.exotelRate / GEMINI_INPUT_SAMPLE_RATE;
    this.toExotelRatio = GEMINI_OUTPUT_SAMPLE_RATE / this.exotelRate;
    this.chunkBytes = exotelChunkBytes(this.exotelRate);
    this.maxPendingInputBytes = this.exotelRate * 2 * 2; // ~2 s of 16-bit PCM

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
    this.geminiClosed = false;
    this.pendingInput = Buffer.alloc(0);

    // Barge-in bookkeeping: one clear frame per interrupted turn, and mute
    // model audio until the interrupted turn's `turnComplete` arrives.
    this.interruptSent = false;
    this.outputMuted = false;
    this._unmuteTimer = null;

    // Per-call booking idempotency: booking key -> Promise<appointment entry>
    this.bookingPromises = new Map();

    // DB `calls.id`, created in the background at call start so appointments
    // can reference it before the call ends.
    this.callId = null;
    this.callIdPromise = null;

    // Rate-limit repeated media-packet errors so one bad stream can't flood logs
    this.mediaErrorCount = 0;
    this.mediaErrorLoggedAt = 0;

    // Latency / throughput instrumentation for this call.
    this.metrics = new CallMetrics(callSid);
    this._statsTimer = null;
    processMetrics.activeCalls++;
    processMetrics.totalCalls++;
    if (latencyLogEnabled && LATENCY_LOG_INTERVAL_MS > 0) {
      this._statsTimer = setInterval(() => this._logStats('interval'), LATENCY_LOG_INTERVAL_MS);
      this._statsTimer.unref?.();
    }
  }

  /** Emit a compact aggregate latency/throughput line for this call. */
  _logStats(kind) {
    logCallStats(kind, this.metrics.snapshot(), { outcome: this.outcome, channel: 'phone' });
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
      this.callIdPromise = upsertCallRecord(this.tenantId, this._startRecord())
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
    // Prefer dashboard-configured voice settings; fall back to env/defaults.
    const envVoice = resolveVoiceSettings();
    const voiceName = this.companyProfile.voiceName || envVoice.voiceName;
    const pitch = this.companyProfile.voicePitch || envVoice.pitch;
    const speed = this.companyProfile.voiceSpeed || envVoice.speed;

    // Prefer dashboard greeting toggle; fall back to the env default.
    const greetingEnabled =
      typeof this.companyProfile.greetingEnabled === 'boolean'
        ? this.companyProfile.greetingEnabled
        : GREETING_ENABLED;
    const greetingText = this.companyProfile.greetingText || buildGreeting(this.companyProfile);

    // Load active instructions fresh for every new call so dashboard
    // activations/deactivations apply immediately to the next call.
    let activeInstructions = [];
    try {
      activeInstructions = await loadActiveInstructions(this.tenantId);
    } catch {
      activeInstructions = [];
    }

    // Resolve the tenant's current runtime mode (expired modes fall back to
    // `available`, producing an empty block).
    let runtimeInstruction = '';
    try {
      const runtimeState = await getTenantRuntimeState(this.tenantId);
      runtimeInstruction = buildRuntimeInstruction(runtimeState);
    } catch (e) {
      this.err('Failed to load runtime mode:', e?.message ?? e);
    }

    const audioSettings = resolveLiveAudioSettings();

    const systemInstruction = buildSystemInstruction(
      this.companyProfile,
      { pitch, speed },
      activeInstructions,
      runtimeInstruction,
    );

    this.log(`Connecting to Gemini Live (model: ${this.liveModel}, voice: ${voiceName})`);

    const doneConnect = timer('gemini-live-connect');
    const connectStartNs = hrNow();
    const sessionPromise = this.ai.live.connect({
      model: this.liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        systemInstruction,
        tools: buildTools(),
        inputAudioTranscription: {
          languageCodes: audioSettings.languageCodes,
          customVocabulary: audioSettings.customVocabulary,
          mode: audioSettings.transcriptionMode,
        },
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
            endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
            silenceDurationMs: audioSettings.endOfSpeechSilenceMs,
            prefixPaddingMs: audioSettings.prefixPaddingMs,
          },
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
        },
      },
      callbacks: {
        onopen: () => {
          doneConnect();
          this.log('Gemini Live session opened');
          if (!greetingEnabled) {
            this.log('Server greeting disabled — waiting for the caller');
            return;
          }
          sessionPromise
            .then((session) => {
              if (this.closed) return;
              try {
                session.sendClientContent({
                  turns: [{ role: 'user', parts: [{ text: `System command: Greet the caller with: "${greetingText}"` }] }],
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
          this.geminiClosed = true;
          this.log('Gemini Live session closed', evt?.code, evt?.reason);
          // Unexpected drop mid-call: don't leave the caller in dead air while
          // pendingInput silently overflows. End the call (idempotent).
          if (!this.closed) {
            this.err('Gemini disconnected unexpectedly — ending call');
            try { if (this.exotelWs.readyState === 1) this.exotelWs.close(1011, 'Gemini disconnected'); } catch { /* ignore */ }
            this.close().catch((e) => this.err('Error closing after Gemini drop:', e));
          }
        },
      },
    });

    const session = await sessionPromise;
    if (this.closed || this.geminiClosed) {
      // The call ended (or Gemini already dropped) while connecting — don't
      // retain a dead session.
      try { session.close(); } catch { /* already closed */ }
      return;
    }
    this.geminiSession = session;
    this.geminiOpen = true;
    const connectMs = msSince(connectStartNs);
    this.metrics.setGeminiConnect(connectMs);
    logPerf('gemini', {
      call: this.callSid,
      connect_ms: connectMs.toFixed(0),
      model: this.liveModel,
      buffered_kb: Number((this.pendingInput.length / 1024).toFixed(1)),
    });
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
      if (this.pendingInput.length > this.maxPendingInputBytes) {
        this.pendingInput = this.pendingInput.subarray(
          this.pendingInput.length - this.maxPendingInputBytes,
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
    while (this.inputBuffer.length >= this.chunkBytes) {
      const chunk = this.inputBuffer.subarray(0, this.chunkBytes);
      this.inputBuffer = this.inputBuffer.subarray(this.chunkBytes);

      const t0 = hrNow();
      const rawGemini = this.toGeminiRatio === 1
        ? chunk
        : resamplePcm16(chunk, this.toGeminiRatio);

      // NOTE: `media` maps to the legacy `realtimeInput.mediaChunks` field and is
      // ignored as audio input by the Live API. Realtime audio must use `audio`.
      this.geminiSession.sendRealtimeInput({
        audio: { data: rawGemini.toString('base64'), mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}` },
      });
      const procMs = msSince(t0);
      this.metrics.noteInbound(procMs, chunk.length);
      if (verboseAudio) logPerf('audio-in', { call: this.callSid, bytes: chunk.length, ms: procMs.toFixed(2) });
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
      this._clearUnmuteTimer();
      this.outputMuted = false; // interrupted turn is over — accept new audio
      this.interruptSent = false;
      this._flushOutputBuffer(true);
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
    // Discard stale audio from an interrupted turn until its turnComplete.
    if (this.outputMuted) return;
    const parts = serverContent?.modelTurn?.parts;
    if (!parts?.length) return;

    for (const part of parts) {
      const data = part?.inlineData?.data;
      if (!data) continue;
      try {
        let rawGemini = Buffer.from(data, 'base64');
        if (rawGemini.length < 2) continue;
        if (rawGemini.length % 2 !== 0) rawGemini = rawGemini.subarray(0, rawGemini.length - 1);

        const rawExotel = this.toExotelRatio === 1
          ? rawGemini
          : resamplePcm16(rawGemini, this.toExotelRatio);

        this.outputBuffer = Buffer.concat([this.outputBuffer, rawExotel]);
      } catch (e) {
        this._mediaError('output', e);
      }
    }

    this._flushOutputBuffer();
  }

  /** Clear queued Exotel playback once per interrupted turn. */
  _handleInterrupt() {
    this.metrics.noteInterrupt();
    this.outputMuted = true;
    this.outputBuffer = Buffer.alloc(0);

    // Watchdog: unmute even if the interrupted turn never reports completion.
    this._clearUnmuteTimer();
    this._unmuteTimer = setTimeout(() => {
      this._unmuteTimer = null;
      if (!this.closed) this.outputMuted = false;
    }, BARGE_IN_MUTE_MS);

    if (this.interruptSent) return;
    this.interruptSent = true;
    this.log('Barge-in — clearing Exotel playback buffer');
    const sent = this._sendExotelFrame({ event: 'clear', [this.streamKey]: this.streamSid });
    logPerf('barge-in', { call: this.callSid, clear_sent: sent ? 1 : 0, interrupts: this.metrics.interrupts });
  }

  _clearUnmuteTimer() {
    if (this._unmuteTimer) {
      clearTimeout(this._unmuteTimer);
      this._unmuteTimer = null;
    }
  }

  /** @param {{ id: string, name: string, args?: object }} fc */
  async _handleToolCall(fc) {
    const startedNs = hrNow();
    let ok = true;
    this.log(`Tool call: ${fc.name} args=${JSON.stringify(fc.args ?? {})}`);
    try {
      if (fc.name === 'bookAppointment') {
        await this._handleBookAppointment(fc);
      } else if (fc.name === 'requestCallback') {
        await this._handleRequestCallback(fc);
      } else if (fc.name === 'captureQuoteRequest') {
        await this._handleQuoteRequest(fc);
      } else if (fc.name === 'takeMessage') {
        await this._handleTakeMessage(fc);
      } else if (fc.name === 'searchKnowledgeBase') {
        await this._handleSearchKnowledge(fc);
      } else {
        this.log(`Unknown tool call: ${fc.name}`);
        this._sendToolResponse(fc, { result: 'OK' });
      }
    } catch (e) {
      ok = false;
      this.err(`Tool "${fc?.name}" failed:`, e);
      // Tell Gemini explicitly NOT to confirm success to the caller.
      this._sendToolResponse(fc, {
        result:
          'FAILED: the action could not be saved due to a system error. Do NOT tell the caller it succeeded. Apologise and offer to try again or take a message.',
      });
    } finally {
      const toolMs = msSince(startedNs);
      this.metrics.recordTool(fc?.name ?? 'unknown', toolMs, ok);
      logPerf('tool', {
        call: this.callSid,
        name: fc?.name ?? 'unknown',
        dur_ms: toolMs.toFixed(1),
        ok: ok ? 1 : 0,
      });
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
          const entry = await persistAppointment(this.tenantId, this.callSid, args, callId);
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
      result = {
        result: `Appointment booked successfully for ${args.date} at ${args.time} (status: ${entry.status}).`,
      };
    } catch (e) {
      this.err('Error persisting appointment:', e);
      this.bookingPromises.delete(key); // allow a clean retry
      result = {
        result:
          'FAILED: the appointment could not be saved due to a system error. Do NOT confirm the booking. Apologise and offer to try again or take a message.',
      };
    }

    // Respond to Gemini FIRST so Maya can keep talking immediately.
    this._sendToolResponse(fc, result);

    // CRM sync + audit in the background — never blocks audio. Resolve the
    // tenant's provider inside the background task so it never delays the tool
    // response, and only sync when this tenant actually configured a CRM.
    if (result.result.includes('successfully')) {
      runBackground('crm-book', async () => {
        if ((await getCrmProvider(this.tenantId)) === 'none') return;
        const sync = await syncToCrm(this.tenantId, {
          contact: { name: args.customerName, phone: this.phone, source: 'phone' },
          call: { callSid: this.callSid, intent: this.intent, outcome: 'booked' },
          appointment: { date: args.date, time: args.time, reason: args.reason, status: 'confirmed' },
          company: this.companyProfile,
        });
        await logCrmSyncEvent(this.tenantId, {
          callSid: this.callSid,
          provider: sync.provider,
          status: sync.ok ? 'success' : 'failed',
          error: sync.error,
        });
      });
    }
  }

  async _handleRequestCallback(fc) {
    const args = fc.args ?? {};
    if (!args.customerName) {
      this._sendToolResponse(fc, {
        result: 'No caller name yet. Ask the caller for their name, then call requestCallback again.',
      });
      return;
    }
    const callId = await this.ensureCallRecord();
    const entry = await persistCallbackRequest(this.tenantId, this.callSid, args, callId);
    if (!this.intent) this.intent = 'Callback request';
    this.caller = args.customerName || this.caller;
    this._sendToolResponse(fc, { result: `Callback request saved successfully (ID: ${entry.id}).` });
  }

  async _handleQuoteRequest(fc) {
    const args = fc.args ?? {};
    if (!args.customerName) {
      this._sendToolResponse(fc, {
        result: 'No caller name yet. Ask the caller for their name, then call captureQuoteRequest again.',
      });
      return;
    }
    const callId = await this.ensureCallRecord();
    const entry = await persistQuoteRequest(this.tenantId, this.callSid, args, callId);
    if (!this.intent) this.intent = 'Quote request';
    this.caller = args.customerName || this.caller;
    this._sendToolResponse(fc, { result: `Quote request saved successfully (ID: ${entry.id}).` });
  }

  async _handleTakeMessage(fc) {
    const args = fc.args ?? {};
    if (!args.customerName || !args.message) {
      this._sendToolResponse(fc, {
        result: 'Need the caller name and the message. Ask for what is missing, then call takeMessage again.',
      });
      return;
    }
    const callId = await this.ensureCallRecord();
    const entry = await persistMessage(this.tenantId, this.callSid, args, callId);
    if (!this.intent) this.intent = 'Message taken';
    this.caller = args.customerName || this.caller;
    this._sendToolResponse(fc, { result: `Message saved successfully (ID: ${entry.id}).` });
  }

  async _handleSearchKnowledge(fc) {
    const query = String(fc.args?.query ?? '').trim();
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
        this.ai.models.embedContent({ model: this.embeddingModel, contents: query }),
        EMBED_TIMEOUT_MS,
        'embedContent',
      );
      doneEmbed();

      const queryVector = response.embeddings?.[0]?.values;
      if (queryVector?.length) {
        const doneSearch = timer('pgvector-search');
        result = await searchKnowledgeEmbeddings(this.tenantId, `[${queryVector.join(',')}]`, 3);
        doneSearch();
      }
    } catch (e) {
      this.err('Error searching knowledge base:', e);
    }

    this._sendToolResponse(fc, { result });
  }

  /** Flush accumulated Gemini output in valid Exotel chunk sizes (multiples of 320 bytes). */
  _flushOutputBuffer(force = false) {
    while (this.outputBuffer.length >= this.chunkBytes) {
      const chunk = this.outputBuffer.subarray(0, this.chunkBytes);
      this.outputBuffer = this.outputBuffer.subarray(this.chunkBytes);
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
    const t0 = hrNow();
    const sent = this._sendExotelFrame({
      event: 'media',
      [this.streamKey]: this.streamSid,
      media: { payload: pcm16Buf.toString('base64') },
    });
    const procMs = msSince(t0);
    if (sent) this.metrics.noteOutbound(procMs, pcm16Buf.length, 1);
    if (verboseAudio && sent) logPerf('audio-out', { call: this.callSid, bytes: pcm16Buf.length, ms: procMs.toFixed(2) });
  }

  /**
   * @param {object} frame
   * @returns {boolean} true if the frame was written to the Exotel socket
   */
  _sendExotelFrame(frame) {
    if (this.exotelWs.readyState !== 1 /* OPEN */) return false;
    try {
      this.exotelWs.send(JSON.stringify(frame));
      return true;
    } catch (e) {
      this.err('Error sending frame to Exotel:', e);
      return false;
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    processMetrics.activeCalls = Math.max(0, processMetrics.activeCalls - 1);
    if (this._statsTimer) { clearInterval(this._statsTimer); this._statsTimer = null; }
    this.geminiOpen = false;
    this.outputMuted = false;
    this._clearUnmuteTimer();
    this.pendingInput = Buffer.alloc(0);
    this.log('Closing call session');

    this._flushOutputBuffer(true);

    if (this.geminiSession) {
      try { this.geminiSession.close(); } catch (e) { this.err('Error closing Gemini session:', e); }
      this.geminiSession = null;
    }

    try {
      // Serialise with the start-time record creation: both upserts replace the
      // transcript rows, so interleaving them can drop the final transcript.
      await this.ensureCallRecord();

      if (this.outcome === 'answered' && this.transcript.length === 0) {
        this.outcome = 'missed';
      }
      const record = this.buildCallRecord();
      const doneDb = timer('db-upsert-call-record');
      const callId = await upsertCallRecord(this.tenantId, record);
      doneDb();
      this.log(`Call record saved (${record.outcome}, ${record.transcript.length} turns)`);

      // Persist per-call latency/throughput for later dashboard audits.
      const m = this.metrics.snapshot();
      await upsertCallMetrics(this.tenantId, callId, {
        callSid: this.callSid,
        channel: 'phone',
        outcome: record.outcome,
        durationSec: record.durationSec,
        geminiConnectMs: m.geminiConnectMs,
        inChunks: m.inChunks,
        inBytes: m.inBytes,
        outFrames: m.outFrames,
        outBytes: m.outBytes,
        inProcAvg: m.inProcMs.avg,
        inProcP95: m.inProcMs.p95,
        outProcAvg: m.outProcMs.avg,
        outProcP95: m.outProcMs.p95,
        turnCount: m.turns.count,
        turnAvgMs: m.turns.avg,
        turnP95Ms: m.turns.p95,
        interrupts: m.interrupts,
        tools: m.tools,
      });

      // Always leave a per-call log row, even if no action tool was called.
      await persistCallLog(this.tenantId, {
        callSid: this.callSid,
        callerNumber: this.phone,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        summary: record.summary,
        transcript: record.transcript,
      });

      runBackground('crm-close', async () => {
        if ((await getCrmProvider(this.tenantId)) === 'none') return;
        const sync = await syncToCrm(this.tenantId, {
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
        await logCrmSyncEvent(this.tenantId, {
          callSid: this.callSid,
          provider: sync.provider,
          status: sync.ok ? 'success' : 'failed',
          error: sync.error,
        });
      });
    } catch (e) {
      this.err('Error persisting call record:', e);
    }

    this._logStats('close');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Logs a concise, secret-free snapshot of the running configuration so a
 * misconfigured deploy is obvious in the Render logs: the DB target (host only,
 * never a URL with credentials), presence of the required secrets, and whether
 * the legacy tenant has a bridge token and a Gemini key. Never logs a secret.
 */
async function logStartupSelfCheck() {
  let dbHost = '(unset)';
  let pooled = false;
  try {
    const parsed = new URL(process.env.DATABASE_URL ?? '');
    dbHost = parsed.hostname;
    pooled = parsed.hostname.includes('-pooler');
  } catch {
    /* leave defaults */
  }

  console.log(
    '[bridge] startup config:',
    JSON.stringify({
      dbHost,
      pooled,
      bridgeAuthSecret: Boolean(process.env.BRIDGE_AUTH_SECRET),
      tenantSecretsKey: Boolean(process.env.TENANT_SECRETS_ENCRYPTION_KEY),
      publicAppOrigin: process.env.PUBLIC_APP_ORIGIN ? 'set' : 'unset',
      metricsEnabled: process.env.METRICS_ENABLED !== '0',
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local',
    }),
  );

  try {
    const legacy = await getLegacyTenant();
    if (legacy) {
      let geminiStatus = 'MISSING';
      try {
        const key = await getTenantGeminiApiKey(legacy.id);
        geminiStatus = key ? 'configured' : 'MISSING';
      } catch (error) {
        geminiStatus =
          error?.name === 'SecretDecryptError'
            ? 'UNDECRYPTABLE (TENANT_SECRETS_ENCRYPTION_KEY mismatch?)'
            : `ERROR: ${error?.message ?? error}`;
      }
      const tokenHash = await getTenantBridgeCredential(legacy.id);
      console.log(
        `[bridge] startup db-check: legacy tenant slug=${legacy.slug} ` +
          `bridgeToken=${tokenHash ? 'configured' : 'MISSING'} geminiKey=${geminiStatus}`,
      );
    } else {
      console.log('[bridge] startup db-check: no legacy tenant present');
    }

    // Decrypt every tenant's Gemini key so a dashboard/bridge master-key
    // mismatch is obvious immediately (it silently breaks calls otherwise).
    const audit = await auditTenantGeminiKeys();
    console.log(
      `[bridge] startup db-check: geminiKeys configured=${audit.configured}` +
        (audit.undecryptable.length
          ? ` undecryptable=[${audit.undecryptable.join(', ')}] — align TENANT_SECRETS_ENCRYPTION_KEY on Vercel and Render`
          : ''),
    );
  } catch (error) {
    console.error('[bridge] startup db-check failed:', error?.message ?? error);
  }
}

async function main() {
  // Validate required env vars. Tenant Gemini credentials are resolved per
  // call/session, so there is deliberately no global GEMINI_API_KEY here.
  const required = [
    [
      'DATABASE_URL',
      'Use the Neon POOLED (PgBouncer) connection string, not the direct endpoint.',
    ],
    [
      'BRIDGE_AUTH_SECRET',
      'Must be identical on Vercel and Render; it verifies browser bridge tokens.',
    ],
    [
      'TENANT_SECRETS_ENCRYPTION_KEY',
      'Must be identical on Vercel and Render; it decrypts tenant provider secrets.',
    ],
  ];
  for (const [name, hint] of required) {
    if (!process.env[name]) {
      console.error(`[bridge] FATAL: ${name} environment variable is not set.\n  ${hint}`);
      process.exit(1);
    }
  }

  // Secret-free diagnostics so a failed deploy is visible in Render logs.
  await logStartupSelfCheck();

  // One-time migration: if the pre-multitenancy Gemini key is still in the
  // environment, move it into the legacy tenant (encrypted) so phone calls keep
  // working after the multitenancy merge. Ordinary tenant traffic still uses
  // per-tenant credentials only. Never logs the key.
  if (process.env.LEGACY_GEMINI_API_KEY || process.env.GEMINI_API_KEY) {
    try {
      const result = await importLegacyGeminiKeyIfNeeded();
      if (result?.imported) {
        console.log(
          `[bridge] imported legacy Gemini key into tenant "${result.slug}" (one-time migration)`,
        );
      }
    } catch (error) {
      console.error('[bridge] legacy Gemini key import failed:', error?.message ?? error);
    }
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
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({
          ok: true,
          service: 'keralai-bridge',
          // Non-secret: compare with the dashboard's /api/health to confirm both
          // processes derived the same TENANT_SECRETS_ENCRYPTION_KEY.
          secretsKeyFingerprint: getSecretsKeyFingerprint(),
        }),
      );
      return;
    }

    if (req.method === 'GET' && url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('KeralaI bridge is running');
      return;
    }

    // Aggregate latency/throughput snapshot for benchmarking (no PII).
    if (req.method === 'GET' && url === '/metrics') {
      if (process.env.METRICS_ENABLED === '0') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const token = process.env.METRICS_TOKEN;
      if (token) {
        const provided =
          new URL(req.url, 'http://localhost').searchParams.get('token') ??
          req.headers['x-metrics-token'];
        if (provided !== token) {
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          res.end('Unauthorized');
          return;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(snapshotProcess(), null, 2));
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

  // Comma-separated allow-list, normalised (trim, lowercase, no trailing "/")
  // so a trailing slash or casing difference can't cause a spurious 403.
  // Unset/empty => allow any origin (previous behaviour).
  const allowedBrowserOrigins = (process.env.PUBLIC_APP_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean);
  const normalizeOrigin = (value) => (value ?? '').trim().replace(/\/+$/, '').toLowerCase();
  let browserOriginRejects = 0;
  console.log(
    '[bridge] /ws/browser allowed origins:',
    allowedBrowserOrigins.length ? allowedBrowserOrigins.join(', ') : 'any (PUBLIC_APP_ORIGIN unset)',
  );

  // ── Tenant resolution helpers ──────────────────────────────────────────────
  /**
   * Resolves a tenant from `/ws/exotel/:slug?token=`. Returns a structured
   * result so a failed upgrade can be logged precisely without ever logging the
   * token or any secret. Only `{ ok: true }` means the slug exists AND the
   * presented token matches the stored hash (constant-time compare).
   */
  async function resolveExotelTenant(slug, token) {
    if (!slug || !token) return { ok: false, reason: 'missing_slug_or_token' };
    const tenant = await getTenantBySlug(slug);
    if (!tenant) return { ok: false, reason: 'unknown_slug' };
    const storedHash = await getTenantBridgeCredential(tenant.id);
    if (!storedHash) return { ok: false, reason: 'no_credential_configured', slug: tenant.slug };
    if (!verifyExotelToken(token, storedHash)) {
      return { ok: false, reason: 'token_mismatch', slug: tenant.slug };
    }
    return { ok: true, tenant };
  }

  server.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const exotelMatch = url.pathname.match(/^\/ws\/exotel\/([^/]+)\/?$/);

      if (exotelMatch) {
        const slug = decodeURIComponent(exotelMatch[1]);
        const token = url.searchParams.get('token') ?? '';

        // Diagnostics BEFORE authentication. Never log the token itself.
        console.log(
          `[bridge][exotel-auth] upgrade path=${url.pathname} slug=${slug || '(none)'} ` +
            `tokenPresent=${token ? 'yes' : 'no'} tokenLength=${token.length}`,
        );

        let resolution;
        try {
          resolution = await resolveExotelTenant(slug, token);
        } catch (error) {
          console.error(
            '[bridge][exotel-auth] tenant resolution failed (database error):',
            error?.message ?? error,
          );
          resolution = { ok: false, reason: 'resolution_error' };
        }

        if (!resolution.ok) {
          console.warn(
            `[bridge][exotel-auth] rejected slug=${slug || '(none)'} reason=${resolution.reason}` +
              (resolution.slug ? ` tenant=${resolution.slug}` : ''),
          );
          // 404 for both unknown slug and bad token — avoids enumeration.
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }

        console.log(
          `[bridge][exotel-auth] accepted slug=${slug} tenant=${resolution.tenant.slug}`,
        );
        req._tenant = resolution.tenant;
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
        return;
      }

      if (url.pathname === '/ws/exotel') {
        // Bare path is rejected: every Exotel call must carry a tenant slug+token.
        console.warn(
          '[bridge][exotel-auth] rejected bare /ws/exotel — the Exotel applet must use ' +
            '/ws/exotel/<tenant-slug>?token=<token> (see dashboard → Settings → Providers)',
        );
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }

      if (url.pathname === '/ws/browser') {
        const token = url.searchParams.get('token') ?? '';
        const verified = verifyBridgeToken(token, 'browser');
        if (!verified.ok) {
          console.warn(
            `[bridge][browser-auth] rejected path=${url.pathname} reason=${verified.reason} ` +
              `tokenPresent=${token ? 'yes' : 'no'}`,
          );
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const origin = req.headers.origin;
        const ip = req.socket.remoteAddress ?? 'unknown';
        const activeSessions = browserSessionsByIp.get(ip) ?? 0;

        if (allowedBrowserOrigins.length && origin && !allowedBrowserOrigins.includes(normalizeOrigin(origin))) {
          if (browserOriginRejects++ < 5) {
            console.warn(
              `[bridge] Rejected /ws/browser origin "${origin}" (allowed: ${allowedBrowserOrigins.join(', ')})`,
            );
          }
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        if (activeSessions >= maxBrowserSessionsPerIp) {
          socket.write('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 60\r\n\r\n');
          socket.destroy();
          return;
        }

        req._bridge = verified.payload;
        browserSessionsByIp.set(ip, activeSessions + 1);
        browserWss.handleUpgrade(req, socket, head, (ws) => {
          ws._keralaiIp = ip;
          browserWss.emit('connection', ws, req);
        });
        return;
      }

      console.warn(`[bridge] rejected WebSocket upgrade for unknown path=${url.pathname}`);
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    } catch (error) {
      console.error('[bridge] Upgrade handler failed:', error?.message ?? error);
      try { socket.destroy(); } catch { /* ignore */ }
    }
  });

  // ── Browser relay handler ──────────────────────────────────────────────────
  browserWss.on('connection', (ws, req) => {
    // The tenant comes from the verified signed token, never from client input.
    const tenantId = req._bridge?.tid;
    console.log('[bridge] New browser voice session from', req.socket.remoteAddress, `(tenant ${tenantId})`);

    /** @type {BrowserSession | null} */
    let session = null;
    let sessionTtl = null;

    // Always release the per-IP slot and close the session, even if setup fails
    // before a BrowserSession exists.
    ws.on('close', () => {
      if (sessionTtl) clearTimeout(sessionTtl);
      const ip = ws._keralaiIp;
      const count = browserSessionsByIp.get(ip) ?? 1;
      if (count <= 1) browserSessionsByIp.delete(ip);
      else browserSessionsByIp.set(ip, count - 1);
      if (session) session.close().catch((e) => console.error('[bridge][browser] close failed:', e));
    });
    ws.on('error', (e) => console.error('[bridge][browser] WebSocket error:', e));

    (async () => {
      if (!tenantId) { ws.close(1008, 'Missing tenant'); return; }

      const tenant = await getTenantById(tenantId);
      if (!tenant) { ws.close(1008, 'Unknown tenant'); return; }

      // Resolve the tenant's own Gemini credential, models, profile and current
      // runtime mode before opening a session. There is no global fallback key.
      const [ai, liveModel, embeddingModel, profile, runtimeState] = await Promise.all([
        getTenantGeminiClient(tenantId),
        getTenantLiveModel(tenantId),
        getTenantEmbeddingModel(tenantId),
        getCompanyProfile(tenantId, { force: true }),
        getTenantRuntimeState(tenantId),
      ]);
      const runtimeInstruction = buildRuntimeInstruction(runtimeState);

      session = new BrowserSession(ws, {
        tenantId,
        ai,
        liveModel,
        embeddingModel,
        companyProfile: profile,
        runtimeInstruction,
        buildInstruction: buildSystemInstruction,
        buildTools,
        buildGreeting,
      });

      sessionTtl = setTimeout(() => {
        if (!session) return;
        session.send({ type: 'error', message: 'This demo session has reached its time limit.' });
        session.close().finally(() => ws.close(1000, 'Session TTL reached'));
      }, Number(process.env.BROWSER_SESSION_TTL_MS ?? 15 * 60 * 1000));

      ws.on('message', async (raw) => {
        if (!session) return;
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
    })().catch((e) => {
      console.error('[bridge][browser] Session setup failed:', e?.message ?? e);
      try { ws.close(1011, 'Session setup failed'); } catch { /* ignore */ }
    });
  });

  // ── Exotel handler ─────────────────────────────────────────────────────────
  wss.on('connection', (ws, req) => {
    const tenant = req._tenant;
    console.log(
      `[bridge] New Exotel WebSocket connection from ${req.socket.remoteAddress} (tenant ${tenant?.slug ?? 'unknown'})`,
    );

    // Applet URL may carry ?sample-rate=8000|16000|24000 (authoritative at start).
    const queryRate =
      normalizeExotelRate(new URL(req.url ?? '/', 'http://localhost').searchParams.get('sample-rate')) ??
      DEFAULT_EXOTEL_RATE;

    /** @type {CallSession | null} */
    let session = null;

    // Cap per-connection protocol warnings so a broken/hostile peer can't flood logs.
    let protocolWarnings = 0;
    const noteProtocol = (msg) => { if (protocolWarnings++ < 5) console.warn(msg); };

    ws.on('message', async (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString()); } catch {
        noteProtocol('[bridge] Received non-JSON WebSocket frame — ignoring'); return;
      }
      // JSON.parse("null"/"123"/'"x"') yields a non-object; frame.event would throw.
      if (!frame || typeof frame !== 'object') return;

      switch (frame.event) {
        case 'connected':
          console.log('[bridge] Exotel connected event received');
          break;

        case 'start': {
          const startMeta = frame.start ?? frame;
          const rawCallSid =
            frame.call_sid ?? frame.callSid ??
            startMeta.call_sid ?? startMeta.callSid ??
            startMeta.call?.sid;
          // Never fall back to a shared constant: `calls.call_sid` is UNIQUE, so
          // two malformed starts would otherwise overwrite the same row.
          const callSid =
            typeof rawCallSid === 'string' && rawCallSid.trim()
              ? rawCallSid.trim()
              : `unknown-${randomUUID()}`;
          const rawStreamSid =
            frame.stream_sid ?? frame.streamSid ??
            startMeta.stream_sid ?? startMeta.streamSid ??
            startMeta.stream?.sid;
          // Mirror the inbound field name on outbound frames so we work with
          // either Twilio (`streamSid`) or snake_case (`stream_sid`) streams.
          const streamKey = (frame.stream_sid != null || startMeta.stream_sid != null)
            ? 'stream_sid'
            : 'streamSid';
          const streamSid =
            typeof rawStreamSid === 'string' && rawStreamSid.trim() ? rawStreamSid.trim() : 'unknown';

          // Prefer the rate Exotel reports for this call, then the applet URL
          // query param, then the env default.
          const exotelRate =
            normalizeExotelRate(startMeta.media_format?.sample_rate) ?? queryRate;

          console.log(
            `[bridge] Call started — callSid=${callSid}, streamSid=${streamSid}, rate=${exotelRate}Hz`,
          );

          if (session) { console.warn('[bridge] Duplicate start event — ignoring'); break; }

          const tenantId = tenant.id;

          // Create the session synchronously (before any await) so concurrent
          // 'start'/'media'/'stop' events always observe it. The tenant-scoped
          // Gemini client/models/profile are resolved immediately below; caller
          // audio captured meanwhile is buffered inside the session.
          const created = new CallSession(callSid, streamSid, streamKey, ws, null, {}, exotelRate, {
            tenantId,
            liveModel: GEMINI_MODEL,
            embeddingModel: EMBEDDING_MODEL,
          });
          session = created;
          created.caller = startMeta.from ?? startMeta.caller ?? startMeta.custom_parameters?.caller ?? 'Unknown caller';
          created.phone = startMeta.from ?? startMeta.custom_parameters?.phone ?? null;
          logPerf('call-start', { call: callSid, stream: streamSid, tenant: tenant.slug, rate: exotelRate });

          // Resolve this tenant's own Gemini credential, models and profile
          // before connecting. Dashboard changes apply to the very next call.
          let setupError = null;
          try {
            const [ai, liveModel, embeddingModel, profile] = await Promise.all([
              getTenantGeminiClient(tenantId),
              getTenantLiveModel(tenantId),
              getTenantEmbeddingModel(tenantId),
              getCompanyProfile(tenantId, { force: true }).catch(() => created.companyProfile),
            ]);
            created.ai = ai;
            created.liveModel = liveModel || created.liveModel;
            created.embeddingModel = embeddingModel || created.embeddingModel;
            created.companyProfile = profile ?? created.companyProfile;
          } catch (e) {
            setupError = e;
            console.error(`[bridge][${callSid}] Tenant setup failed:`, e?.message ?? e);
          }

          // Create the DB calls row in the background so bookings can reference
          // it even though the call is still in progress.
          void created.ensureCallRecord();

          // A 'stop' may have arrived while we awaited — don't connect Gemini.
          if (created.closed) break;

          // A tenant without a usable Gemini credential cannot run a call.
          if (!created.ai) {
            console.error(
              `[bridge][${callSid}] No usable Gemini credential for tenant ${tenant.slug}` +
                (setupError ? ` (${setupError.message})` : '') +
                ' — ending call',
            );
            if (session === created) session = null;
            try { await created.close(); } catch { /* logged inside close() */ }
            if (ws.readyState === 1) ws.close(1011, 'Tenant Gemini credential unavailable');
            break;
          }

          try {
            await created.openGeminiSession();
          } catch (e) {
            console.error(`[bridge][${callSid}] Failed to open Gemini session:`, e);
            if (session === created) session = null;
            // Persist a final record (and clear the start row) rather than
            // leaving a dangling "in progress" call.
            try { await created.close(); } catch { /* logged inside close() */ }
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
          noteProtocol(`[bridge] Unknown Exotel event: ${frame.event}`);
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
║  Exotel WS   :  ws://localhost:${port}/ws/exotel/:slug        ║
║  Browser WS  :  ws://localhost:${port}/ws/browser             ║
║                                                              ║
║  Exotel rate : ${DEFAULT_EXOTEL_RATE} Hz (default; per-call via applet) ║
║  Gemini in   : ${GEMINI_INPUT_SAMPLE_RATE} Hz                              ║
║  Gemini out  : ${GEMINI_OUTPUT_SAMPLE_RATE} Hz                              ║
║  Profile TTL : ${PROFILE_TTL_MS / 1000}s                              ║
║  Tenants     : per-tenant credentials + models (no global key) ║
║  Greeting    : ${GREETING_ENABLED ? 'ON (server)' : 'OFF (external/Exotel)'}                ║
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