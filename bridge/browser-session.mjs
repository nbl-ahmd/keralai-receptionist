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
  logCrmSyncEvent,
  persistAppointment,
  searchKnowledgeEmbeddings,
  upsertCallRecord,
} from './db.mjs';
import { getCrmProvider, syncToCrm } from './crm.mjs';

const MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

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

    const sessionPromise = this.ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.voiceName } } },
        systemInstruction: this.buildInstruction(this.companyProfile, {
          pitch: this.pitch,
          speed: this.speed,
        }),
        tools: this.buildTools(),
        inputAudioTranscription: {},
        outputAudioTranscription: {},
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
            console.error('[browser][relay] RAG failed:', error);
          }
          this.geminiSession.sendToolResponse({
            functionResponses: { id: fc.id, name: fc.name, response: { result: results } },
          });
        }
      }
    }

    const audio = message.serverContent?.modelTurn?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (audio) this.send({ type: 'audio', data: audio });
    if (message.serverContent?.interrupted) this.send({ type: 'interrupted' });
  }

  sendAudio(data, mimeType = 'audio/pcm;rate=16000') {
    if (this.closed || !this.geminiSession || !data) return;
    this.geminiSession.sendRealtimeInput({ media: { data, mimeType } });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const endedAt = new Date().toISOString();
    const durationSec = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(this.startedAt)) / 1000));
    if (this.outcome === 'answered' && this.transcript.length === 0) this.outcome = 'abandoned';

    if (!this.report) {
      try { this.geminiSession?.close(); } catch { /* already closed */ }
      this.geminiSession = null;
      return;
    }

    try {
      await upsertCallRecord({
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
  }
}
