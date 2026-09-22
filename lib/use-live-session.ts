"use client";

/**
 * useLiveSession
 *
 * Shared Gemini Live session logic for Maya. Extracted so the dashboard's voice
 * console and the landing-page demo share one implementation (audio in/out,
 * transcripts, tool calls, barge-in, and call reporting).
 *
 * The session persists call records to /api/calls unless `report` is disabled,
 * which keeps demo traffic out of real analytics.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleGenAI, LiveServerMessage, Modality, Session } from "@google/genai";
import { createPcmBlob, decodeAudio, decodeAudioData } from "../utils/audioUtils";
import { Appointment, CallRecord, CompanyProfile, TranscriptTurn } from "../types";
import { buildGreeting, buildSystemInstruction, buildTools } from "./maya-config";

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

export interface LiveSessionOptions {
  companyProfile: CompanyProfile;
  /** Called when Maya books an appointment via tool call. */
  onBookAppointment?: (apt: Appointment) => void;
  /** Called for every transcript turn so UIs can render a live transcript. */
  onTranscript?: (turns: TranscriptTurn[]) => void;
  /** Persist the call record to /api/calls on hangup. Disable for demos. */
  report?: boolean;
  /** Override the opening line. Defaults to the profile-based greeting. */
  greeting?: string;
  voiceName?: string;
  pitch?: string;
  speed?: string;
}

export interface LiveSessionState {
  isConnected: boolean;
  isMuted: boolean;
  volume: number;
  error: string | null;
  transcript: TranscriptTurn[];
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMute: () => void;
}

export function useLiveSession({
  companyProfile,
  onBookAppointment,
  onTranscript,
  report = true,
  greeting,
  voiceName = "Aoede",
  pitch = "Normal",
  speed = "Normal",
}: LiveSessionOptions): LiveSessionState {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const connectedRef = useRef(false);

  // Per-call reporting state
  const callIdRef = useRef<string>(`call-${Date.now()}`);
  const startedAtRef = useRef<string>(new Date().toISOString());
  const transcriptRef = useRef<TranscriptTurn[]>([]);
  const bookingIdsRef = useRef<string[]>([]);
  const knowledgeQueriesRef = useRef<string[]>([]);
  const outcomeRef = useRef<CallRecord["outcome"]>("answered");
  const intentRef = useRef<string | undefined>(undefined);

  // Keep latest callbacks/config without re-creating connect()
  const profileRef = useRef(companyProfile);
  const bookRef = useRef(onBookAppointment);
  const transcriptCbRef = useRef(onTranscript);
  const reportRef = useRef(report);
  const greetingRef = useRef(greeting);
  const configRef = useRef({ voiceName, pitch, speed });

  useEffect(() => {
    profileRef.current = companyProfile;
    bookRef.current = onBookAppointment;
    transcriptCbRef.current = onTranscript;
    reportRef.current = report;
    greetingRef.current = greeting;
    configRef.current = { voiceName, pitch, speed };
  }, [companyProfile, onBookAppointment, onTranscript, report, greeting, voiceName, pitch, speed]);

  const pushTranscript = useCallback((role: TranscriptTurn["role"], text: string) => {
    if (!text || !text.trim()) return;
    const clean = text.trim();
    const turns = transcriptRef.current;
    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      last.text = `${last.text} ${clean}`.trim();
    } else {
      turns.push({ role, text: clean, at: new Date().toISOString() });
    }
    const snapshot = turns.map((turn) => ({ ...turn }));
    setTranscript(snapshot);
    transcriptCbRef.current?.(snapshot);
  }, []);

  const reportCall = useCallback(async () => {
    if (!reportRef.current) return;
    const endedAt = new Date().toISOString();
    const durationSec = Math.max(
      0,
      Math.round((new Date(endedAt).getTime() - new Date(startedAtRef.current).getTime()) / 1000),
    );
    const turns = transcriptRef.current;
    const record: CallRecord = {
      id: callIdRef.current,
      callSid: callIdRef.current,
      caller: "Browser visitor",
      channel: "browser",
      startedAt: startedAtRef.current,
      endedAt,
      durationSec,
      outcome: outcomeRef.current,
      intent: intentRef.current,
      summary: turns.length
        ? turns
            .slice(0, 4)
            .map((turn) => `${turn.role === "caller" ? "Caller" : "Maya"}: ${turn.text}`)
            .join(" ")
        : undefined,
      sentiment: "neutral",
      transcript: turns.map((turn) => ({ ...turn })),
      bookingIds: [...bookingIdsRef.current],
      knowledgeQueries: [...knowledgeQueriesRef.current],
    };
    try {
      await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
    } catch (err) {
      console.error("Failed to report call", err);
    }
  }, []);

  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const disconnect = useCallback(async () => {
    if (sessionRef.current) await reportCall();

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (err) {
        console.error("Error closing session", err);
      }
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (inputAudioContextRef.current) {
      await inputAudioContextRef.current.close().catch(() => undefined);
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      await outputAudioContextRef.current.close().catch(() => undefined);
      outputAudioContextRef.current = null;
    }
    stopPlayback();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

    connectedRef.current = false;
    setIsConnected(false);
    setVolume(0);
  }, [reportCall, stopPlayback]);

  const drawVisualizer = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!connectedRef.current) return;
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      setVolume(sum / bufferLength);

      ctx.fillStyle = "rgb(248, 250, 252)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 1.5;
        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, "#10b981");
        gradient.addColorStop(1, "#059669");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
  }, []);

  const connect = useCallback(async () => {
    setError(null);

    const apiKey =
      process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
      process.env.NEXT_PUBLIC_API_KEY ||
      process.env.API_KEY;
    if (!apiKey) {
      setError("API key is missing. Add NEXT_PUBLIC_GOOGLE_API_KEY to your environment.");
      return;
    }

    // Reset per-call state
    callIdRef.current = `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    startedAtRef.current = new Date().toISOString();
    transcriptRef.current = [];
    bookingIdsRef.current = [];
    knowledgeQueriesRef.current = [];
    outcomeRef.current = "answered";
    intentRef.current = undefined;
    setTranscript([]);

    try {
      const ai = new GoogleGenAI({ apiKey });

      inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const analyser = outputAudioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const profile = profileRef.current;
      const { voiceName: voice, pitch: p, speed: s } = configRef.current;

      const sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          systemInstruction: buildSystemInstruction(profile, { pitch: p, speed: s }),
          tools: buildTools(),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            connectedRef.current = true;
            setIsConnected(true);

            // Instant greeting
            const openingLine = greetingRef.current || buildGreeting(profile);
            sessionPromise.then((session) =>
              session.sendClientContent({
                turns: [
                  {
                    role: "user",
                    parts: [{ text: `System command: Greet the caller with: "${openingLine}"` }],
                  },
                ],
                turnComplete: true,
              }),
            );

            const inputCtx = inputAudioContextRef.current;
            if (!inputCtx || !streamRef.current) return;

            const source = inputCtx.createMediaStreamSource(streamRef.current);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (event) => {
              if (mutedRef.current) return;
              const inputData = event.inputBuffer.getChannelData(0);
              sessionPromise.then((session) =>
                session.sendRealtimeInput({ media: createPcmBlob(inputData) }),
              );
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },

          onmessage: async (message: LiveServerMessage) => {
            const inputText = message.serverContent?.inputTranscription?.text;
            if (inputText) pushTranscript("caller", inputText);
            const outputText = message.serverContent?.outputTranscription?.text;
            if (outputText) pushTranscript("maya", outputText);

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls ?? []) {
                if (fc.name === "bookAppointment") {
                  const args = fc.args as {
                    customerName: string;
                    date: string;
                    time: string;
                    reason?: string;
                  };
                  const appointment: Appointment = {
                    id: crypto.randomUUID(),
                    customerName: args.customerName,
                    date: args.date,
                    time: args.time,
                    reason: args.reason,
                    status: "confirmed",
                    createdAt: new Date().toISOString(),
                  };
                  bookRef.current?.(appointment);
                  bookingIdsRef.current.push(appointment.id);
                  outcomeRef.current = "booked";
                  intentRef.current = args.reason || "Appointment booking";

                  sessionPromise.then((session) =>
                    session.sendToolResponse({
                      functionResponses: {
                        id: fc.id,
                        name: fc.name,
                        response: { result: "Appointment booked successfully." },
                      },
                    }),
                  );
                } else if (fc.name === "searchKnowledgeBase") {
                  const args = fc.args as { query: string };
                  knowledgeQueriesRef.current.push(args.query);
                  if (!intentRef.current) intentRef.current = args.query;

                  fetch("/api/knowledge/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: args.query }),
                  })
                    .then((res) => res.json())
                    .then((data) => {
                      sessionPromise.then((session) =>
                        session.sendToolResponse({
                          functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { result: data.results ?? [] },
                          },
                        }),
                      );
                    })
                    .catch(() => {
                      sessionPromise.then((session) =>
                        session.sendToolResponse({
                          functionResponses: {
                            id: fc.id,
                            name: fc.name,
                            response: { result: [] },
                          },
                        }),
                      );
                    });
                }
              }
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            const outputCtx = outputAudioContextRef.current;
            if (base64Audio && outputCtx) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const audioBuffer = await decodeAudioData(decodeAudio(base64Audio), outputCtx, OUTPUT_SAMPLE_RATE, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;

              if (analyserRef.current) {
                source.connect(analyserRef.current);
                analyserRef.current.connect(outputCtx.destination);
              } else {
                source.connect(outputCtx.destination);
              }
              source.addEventListener("ended", () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) stopPlayback();
          },

          onclose: () => {
            connectedRef.current = false;
            setIsConnected(false);
          },

          onerror: (err) => {
            console.error("Gemini Live error:", err);
            setError("Connection error. Please try again.");
            void disconnect();
          },
        },
      });

      sessionRef.current = await sessionPromise;
      drawVisualizer();
    } catch (err) {
      console.error("Connection failed:", err);
      setError(err instanceof Error ? err.message : "Failed to connect to the AI service.");
      void disconnect();
    }
  }, [disconnect, drawVisualizer, pushTranscript, stopPlayback]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      mutedRef.current = !prev;
      return !prev;
    });
  }, []);

  return {
    isConnected,
    isMuted,
    volume,
    error,
    transcript,
    analyserRef,
    canvasRef,
    connect,
    disconnect,
    toggleMute,
  };
}

/** Voice options shared by the console and landing demo. */
export const VOICE_OPTIONS = [
  { id: "Aoede", label: "Aoede", gender: "Female", desc: "Warm & Professional" },
  { id: "Kore", label: "Kore", gender: "Female", desc: "Calm & Professional" },
  { id: "Zephyr", label: "Zephyr", gender: "Female", desc: "Friendly & Warm" },
  { id: "Puck", label: "Puck", gender: "Male", desc: "Deep & Steady" },
  { id: "Fenrir", label: "Fenrir", gender: "Male", desc: "Authoritative" },
  { id: "Charon", label: "Charon", gender: "Male", desc: "Deep & Resonant" },
] as const;

export { LIVE_MODEL };
export const useMemoizedTools = () => useMemo(() => buildTools(), []);
