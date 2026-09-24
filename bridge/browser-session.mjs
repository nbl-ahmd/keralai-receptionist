/**
 * bridge/browser-session.mjs
 *
 * Browser Gemini Live relay.
 *
 * The browser sends audio to the bridge over /ws/browser. Gemini credentials,
 * RAG, booking, CRM, and call persistence stay server-side. Audio chunks are
 * forwarded as-is (browser already sends at 16 kHz PCM; no resampling needed).
 */

import { Modality } from '@google/genai';
import {
  loadActiveInstructions,
  logCrmSyncEvent,
  persistAppointment,
  persistCallbackRequest,
  persistMessage,
  persistQuoteRequest,
  searchKnowledgeEmbeddings,
  upsertCallMetrics,
  upsertCallRecord,
} from './db.mjs';
import { getCrmProvider, syncToCrm } from './crm.mjs';
import { resolveLiveAudioSettings } from './shared/maya-config.mjs';
import {
  CallMetrics,
  LATENCY_LOG_INTERVAL_MS,
  hrNow,
  latencyLogEnabled,
  logCallStats,
  logPerf,
  msSince,
  processMetrics,
  verboseAudio,
} from './metrics.mjs';

const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

/** Base64 length -> approximate decoded byte count (for throughput metrics). */
const b64Bytes = (data) => Math.floor((data?.length ?? 0) * 0.75);

export class BrowserSession {
  constructor(ws, ai, companyProfile, buildInstruction, buildTools, buildGreeting) {
    this.ws = ws;
    this.ai = ai;
    this.companyProfile = companyProfile;
    this.buildInstruction = buildInstruction;
    this.buildTools = buildTools;
    this.buildGreeting = buildGreeting;
    this.geminiSession = null;
    this._opening = false;
    this.closed = false;
    this.callSid = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.startedAt = new Date().toISOString();
    this.transcript = [];
    this.bookingIds = [];
    this.knowledgeQueries = [];
    this.outcome = 'answered';
    this.intent = null;
    this.greeting = null;
    this.voiceName = 'Aoede';
    this.pitch = 'Normal';
    this.speed = 'Normal';
    this.report = true;

    this.metrics = new CallMetrics(this.callSid);
    this._statsTimer = null;
    processMetrics.activeCalls++;
    processMetrics.totalCalls++;
    if (latencyLogEnabled && LATENCY_LOG_INTERVAL_MS > 0) {
      this._statsTimer = setInterval(
        () => logCallStats('interval', this.metrics.snapshot(), { outcome: this.outcome, channel: 'browser' }),
        LATENCY_LOG_INTERVAL_MS,
      );
      this._statsTimer.unref?.();
    }
  }

  send(frame) {
    if (this.ws.readyState !== 1) return;
    try {
      this.ws.send(JSON.stringify(frame));
    } catch (error) {
      console.error('[browser][relay] send failed:', error.message);
    }
  }

  addTranscript(role, text) {
    if (!text || !text.trim()) return;
    const clean = text.trim();
    const last = this.transcript[this.transcript.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text} ${clean}`.trim();
    } else {
      this.transcript.push({ role, text: clean, at: new Date().toISOString() });
    }
    this.send({ type: 'transcript', role, text: clean });
  }

  async open(options = {}) {
    // Idempotent start: ignore a repeated 'start' while opening or already open.
    if (this.closed || this.geminiSession || this._opening) return;
    this._opening = true;

    this.report = options.report !== false;
    this.greeting = typeof options.greeting === 'string' ? options.greeting.slice(0, 300) : null;
    this.voiceName = typeof options.voiceName === 'string' ? options.voiceName : 'Aoede';
    this.pitch = typeof options.pitch === 'string' ? options.pitch : 'Normal';
    this.speed = typeof options.speed === 'string' ? options.speed : 'Normal';

    // Load active instructions fresh for every new session so dashboard
    // activations/deactivations apply immediately to the next call.
    let activeInstructions = [];
    try {
      activeInstructions = await loadActiveInstructions();
    } catch {
      activeInstructions = [];
    }
    const audioSettings = resolveLiveAudioSettings();

    const connectStartNs = hrNow();
    const sessionPromise = this.ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceName } } },
        systemInstruction: this.buildInstruction(
          this.companyProfile,
          {
            pitch: this.pitch,
            speed: this.speed,
          },
          activeInstructions,
        ),
        tools: this.buildTools(),
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
          const openingLine = this.greeting || this.buildGreeting(this.companyProfile);
          this.send({ type: 'connected' });
          sessionPromise.then((session) => session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: `System command: Greet the caller with: "${openingLine}"` }] }],
            turnComplete: true,
          }));
        },
        onmessage: (message) => {
          if (this.closed) return;
          this.handleGeminiMessage(message).catch((error) => {
            console.error('[browser][relay] message failed:', error);
            this.send({ type: 'error', message: 'The voice session encountered an error.' });
          });
        },
        onerror: (error) => {
          console.error('[browser][relay] Gemini error:', error);
          this.send({ type: 'error', message: 'Gemini Live connection failed.' });
        },
        onclose: () => this.send({ type: 'closed' }),
      },
    });
    try {
      this.geminiSession = await sessionPromise;
      const connectMs = msSince(connectStartNs);
      this.metrics.setGeminiConnect(connectMs);
      logPerf('gemini', {
        call: this.callSid,
        channel: 'browser',
        connect_ms: connectMs.toFixed(0),
        model: MODEL,
      });
    } finally {
      this._opening = false;
    }
  }

  async handleGeminiMessage(message) {
    const inputText = message.serverContent?.inputTranscription?.text;
    if (inputText) this.addTranscript('caller', inputText);
    const outputText = message.serverContent?.outputTranscription?.text;
    if (outputText) this.addTranscript('maya', outputText);

    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls ?? []) {
        const toolStartNs = hrNow();
        let toolOk = true;
        if (fc.name === 'bookAppointment') {
          const args = fc.args;
          let result;
          try {
            const appointment = this.report
              ? await persistAppointment(this.callSid, args)
              : {
                  id: `demo-${Date.now()}`,
                  customerName: args.customerName,
                  date: args.date,
                  time: args.time,
                  reason: args.reason,
                  status: 'confirmed',
                };
            this.bookingIds.push(appointment.id);
            this.outcome = 'booked';
            this.intent = args.reason || 'Appointment booking';
            this.send({ type: 'booking', appointment });
            result = { result: 'Appointment booked successfully.' };
          } catch (error) {
            toolOk = false;
            console.error('[browser][relay] booking failed:', error);
            result = { result: 'Unable to save the appointment. Please offer another way to follow up.' };
          }

          // Send tool response first — don't block Maya on CRM sync
          this.geminiSession.sendToolResponse({
            functionResponses: { id: fc.id, name: fc.name, response: result },
          });

          // Fire-and-forget CRM sync (only for bookAppointment in report mode)
          if (this.report && getCrmProvider() !== 'none' && result.result.includes('successfully')) {
            syncToCrm({
              contact: { name: 'Browser visitor', source: 'web' },
              call: { callSid: this.callSid, intent: this.intent, outcome: this.outcome },
              company: this.companyProfile,
            })
              .then((sync) => logCrmSyncEvent({
                callSid: this.callSid,
                provider: sync.provider,
                status: sync.ok ? 'success' : 'failed',
                error: sync.error,
              }))
              .catch((e) => console.error('[browser][relay] CRM sync error:', e));
          }
        } else if (fc.name === 'searchKnowledgeBase') {
          const query = fc.args?.query || '';
          this.knowledgeQueries.push(query);
          if (!this.intent) this.intent = query;
          let results = [];
          try {
            const embedding = await this.ai.models.embedContent({
              model: 'gemini-embedding-2',
              contents: query,
            });
            const values = embedding.embeddings?.[0]?.values;
            if (values) results = await searchKnowledgeEmbeddings(`[${values.join(',')}]`, 3);
          } catch (error) {
            toolOk = false;
            console.error('[browser][relay] RAG failed:', error);
          }
          this.geminiSession.sendToolResponse({
            functionResponses: { id: fc.id, name: fc.name, response: { result: results } },
          });
        } else if (
          fc.name === 'requestCallback' ||
          fc.name === 'captureQuoteRequest' ||
          fc.name === 'takeMessage'
        ) {
          let response;
          try {
            if (this.report) {
              if (fc.name === 'requestCallback') {
                await persistCallbackRequest(this.callSid, fc.args, null);
              } else if (fc.name === 'captureQuoteRequest') {
                await persistQuoteRequest(this.callSid, fc.args, null);
              } else {
                await persistMessage(this.callSid, fc.args, null);
              }
            }
            response = { result: 'Saved successfully.' };
          } catch (error) {
            toolOk = false;
            console.error('[browser][relay] action failed:', error);
            response = {
              result: 'FAILED: could not save due to a system error. Do not confirm; apologise and offer to try again.',
            };
          }
          this.geminiSession.sendToolResponse({
            functionResponses: { id: fc.id, name: fc.name, response },
          });
        } else if (fc.name) {
          this.geminiSession.sendToolResponse({
            functionResponses: { id: fc.id, name: fc.name, response: { result: 'OK' } },
          });
        }

        const toolMs = msSince(toolStartNs);
        this.metrics.recordTool(fc?.name ?? 'unknown', toolMs, toolOk);
        logPerf('tool', {
          call: this.callSid,
          channel: 'browser',
          name: fc?.name ?? 'unknown',
          dur_ms: toolMs.toFixed(1),
          ok: toolOk ? 1 : 0,
        });
      }
    }

    const audio = message.serverContent?.modelTurn?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (audio) {
      const t0 = hrNow();
      this.send({ type: 'audio', data: audio });
      const procMs = msSince(t0);
      this.metrics.noteOutbound(procMs, b64Bytes(audio), 1);
      if (verboseAudio) {
        logPerf('audio-out', { call: this.callSid, channel: 'browser', bytes: b64Bytes(audio), ms: procMs.toFixed(2) });
      }
    }
    if (message.serverContent?.interrupted) {
      this.metrics.noteInterrupt();
      this.send({ type: 'interrupted' });
    }
  }

  sendAudio(data, mimeType = 'audio/pcm;rate=16000') {
    if (this.closed || !this.geminiSession || !data) return;
    const t0 = hrNow();
    // `audio` (not `media`) is the current realtime-input field; `media` maps to
    // the legacy `mediaChunks` and is not treated as audio input.
    this.geminiSession.sendRealtimeInput({ audio: { data, mimeType } });
    const procMs = msSince(t0);
    this.metrics.noteInbound(procMs, b64Bytes(data));
    if (verboseAudio) {
      logPerf('audio-in', { call: this.callSid, channel: 'browser', bytes: b64Bytes(data), ms: procMs.toFixed(2) });
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    processMetrics.activeCalls = Math.max(0, processMetrics.activeCalls - 1);
    if (this._statsTimer) { clearInterval(this._statsTimer); this._statsTimer = null; }
    const endedAt = new Date().toISOString();
    const durationSec = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(this.startedAt)) / 1000));
    if (this.outcome === 'answered' && this.transcript.length === 0) this.outcome = 'abandoned';

    if (!this.report) {
      try { this.geminiSession?.close(); } catch { /* already closed */ }
      this.geminiSession = null;
      logCallStats('close', this.metrics.snapshot(), { outcome: this.outcome, channel: 'browser', report: 0 });
      return;
    }

    try {
      const callId = await upsertCallRecord({
        id: this.callSid,
        callSid: this.callSid,
        caller: 'Browser visitor',
        channel: 'browser',
        startedAt: this.startedAt,
        endedAt,
        durationSec,
        outcome: this.outcome,
        intent: this.intent,
        summary: this.transcript.slice(0, 4).map((t) => `${t.role === 'caller' ? 'Caller' : 'Maya'}: ${t.text}`).join(' ') || undefined,
        sentiment: 'neutral',
        transcript: this.transcript,
        bookingIds: this.bookingIds,
        knowledgeQueries: this.knowledgeQueries,
      });

      const m = this.metrics.snapshot();
      await upsertCallMetrics(callId, {
        callSid: this.callSid,
        channel: 'browser',
        outcome: this.outcome,
        durationSec,
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

      if (getCrmProvider() !== 'none') {
        syncToCrm({
          contact: { name: 'Browser visitor', source: 'web' },
          call: { callSid: this.callSid, intent: this.intent, outcome: this.outcome, durationSec, startedAt: this.startedAt },
          company: this.companyProfile,
        })
          .then((sync) => logCrmSyncEvent({
            callSid: this.callSid,
            provider: sync.provider,
            status: sync.ok ? 'success' : 'failed',
            error: sync.error,
          }))
          .catch((e) => console.error('[browser][relay] CRM close sync error:', e));
      }
    } catch (error) {
      console.error('[browser][relay] call persistence failed:', error);
    }

    try { this.geminiSession?.close(); } catch { /* already closed */ }
    this.geminiSession = null;
    logCallStats('close', this.metrics.snapshot(), { outcome: this.outcome, channel: 'browser', report: 1 });
  }
}
