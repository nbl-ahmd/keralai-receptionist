"use client";

/**
 * Browser client for the server-owned Gemini Live relay.
 *
 * No Gemini API key is present in this module. Audio is sent to
 * `/ws/browser`; server.mjs owns Gemini, RAG, bookings, CRM, and persistence.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Appointment, CompanyProfile, TranscriptTurn } from "../types";
import { createPcmBlob, decodeAudio, decodeAudioData } from "../utils/audioUtils";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
/** Give up (and surface an error) if the relay isn't ready within this window. */
const CONNECT_TIMEOUT_MS = 20000;

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export interface LiveSessionOptions {
  companyProfile: CompanyProfile;
  onBookAppointment?: (appointment: Appointment) => void;
  onTranscript?: (turns: TranscriptTurn[]) => void;
  /** Persist this session as a real call. Demo sessions set this to false. */
  report?: boolean;
  greeting?: string;
  voiceName?: string;
  pitch?: string;
  speed?: string;
}

export interface LiveSessionState {
  isConnected: boolean;
  isConnecting: boolean;
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

interface RelayFrame {
  type: string;
  data?: string;
  role?: TranscriptTurn["role"];
  text?: string;
  message?: string;
  appointment?: Appointment;
}

/**
 * The voice relay lives on the standalone bridge service (Render), which is a
 * different origin from the Next.js dashboard (Vercel). Point at it explicitly
 * via NEXT_PUBLIC_BRIDGE_WS_URL (e.g. wss://keralai-bridge.onrender.com).
 * Falls back to the current origin for a same-host deployment (local dev).
 */
const BRIDGE_WS_URL = process.env.NEXT_PUBLIC_BRIDGE_WS_URL;

function websocketUrl(): string {
  if (BRIDGE_WS_URL) {
    const base = BRIDGE_WS_URL.replace(/\/+$/, "");
    return `${base}/ws/browser`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/browser`;
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const transcriptRef = useRef<TranscriptTurn[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const mutedRef = useRef(false);
  const connectedRef = useRef(false);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);

  const bookingRef = useRef(onBookAppointment);
  const transcriptCallbackRef = useRef(onTranscript);
  const configRef = useRef({ report, greeting, voiceName, pitch, speed });

  useEffect(() => {
    bookingRef.current = onBookAppointment;
    transcriptCallbackRef.current = onTranscript;
    configRef.current = { report, greeting, voiceName, pitch, speed };
  }, [companyProfile, onBookAppointment, onTranscript, report, greeting, voiceName, pitch, speed]);

  const stopPlayback = useCallback(() => {
    sourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
  }, []);

  const pushTranscript = useCallback((role: TranscriptTurn["role"], text: string) => {
    if (!text?.trim()) return;
    const turns = transcriptRef.current.map((turn) => ({ ...turn }));
    const last = turns[turns.length - 1];
    if (last?.role === role) {
      turns[turns.length - 1] = { ...last, text: `${last.text} ${text.trim()}`.trim() };
    } else {
      turns.push({ role, text: text.trim(), at: new Date().toISOString() });
    }
    transcriptRef.current = turns;
    setTranscript(turns);
    transcriptCallbackRef.current?.(turns);
  }, []);

  const drawVisualizer = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!analyser || !canvas || !context) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      if (!connectedRef.current) return;
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setVolume(average);
      context.fillStyle = "rgb(248, 250, 252)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / data.length) * 2.5;
      let x = 0;
      data.forEach((value) => {
        const height = value / 1.5;
        const gradient = context.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, "#10b981");
        gradient.addColorStop(1, "#059669");
        context.fillStyle = gradient;
        context.fillRect(x, canvas.height - height, barWidth, height);
        x += barWidth + 1;
      });
    };
    draw();
  }, []);

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    clearConnectTimeout();
    setIsConnecting(false);
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "stop" }));
      socketRef.current.close(1000, "Client ended session");
    }
    socketRef.current = null;
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (inputContextRef.current) await inputContextRef.current.close().catch(() => undefined);
    if (outputContextRef.current) await outputContextRef.current.close().catch(() => undefined);
    inputContextRef.current = null;
    outputContextRef.current = null;
    stopPlayback();
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    connectedRef.current = false;
    setIsConnected(false);
    setVolume(0);
  }, [clearConnectTimeout, stopPlayback]);

  const connect = useCallback(async () => {
    setError(null);
    clearConnectTimeout();
    setIsConnecting(true);
    transcriptRef.current = [];
    setTranscript([]);
    connectedRef.current = false;

    try {
      const inputContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE,
      });
      const outputContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE,
      });
      inputContextRef.current = inputContext;
      outputContextRef.current = outputContext;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const analyser = outputContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const url = websocketUrl();
      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = async (event) => {
        const frame = JSON.parse(event.data) as RelayFrame;
        if (frame.type === "connected") {
          clearConnectTimeout();
          connectedRef.current = true;
          setIsConnecting(false);
          setIsConnected(true);
          drawVisualizer();
          return;
        }
        if (frame.type === "transcript" && frame.role && frame.text) {
          pushTranscript(frame.role, frame.text);
          return;
        }
        if (frame.type === "booking" && frame.appointment) {
          bookingRef.current?.(frame.appointment);
          return;
        }
        if (frame.type === "error") {
          clearConnectTimeout();
          setIsConnecting(false);
          setError(frame.message || "Voice relay error.");
          return;
        }
        if (frame.type === "interrupted") {
          stopPlayback();
          return;
        }
        if (frame.type === "audio" && frame.data && outputContextRef.current) {
          const context = outputContextRef.current;
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, context.currentTime);
          const audioBuffer = await decodeAudioData(
            decodeAudio(frame.data),
            context,
            OUTPUT_SAMPLE_RATE,
            1,
          );
          const source = context.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(analyserRef.current || context.destination);
          if (analyserRef.current) analyserRef.current.connect(context.destination);
          source.addEventListener("ended", () => sourcesRef.current.delete(source));
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
          sourcesRef.current.add(source);
        }
      };

      socket.onerror = () => {
        clearConnectTimeout();
        setIsConnecting(false);
        setError(`Could not reach the voice relay at ${url}. Check the bridge URL.`);
      };
      socket.onclose = () => {
        clearConnectTimeout();
        connectedRef.current = false;
        setIsConnecting(false);
        setIsConnected(false);
      };

      // If the relay never reports ready (bad URL, bridge down, rejected origin),
      // fail visibly instead of leaving the button stuck on "Connecting…".
      connectTimeoutRef.current = window.setTimeout(() => {
        connectTimeoutRef.current = null;
        if (!connectedRef.current) {
          setError(`The voice relay didn't respond in time (${url}). Please try again.`);
          void disconnect();
        }
      }, CONNECT_TIMEOUT_MS);

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => {
          const config = configRef.current;
          socket.send(JSON.stringify({
            type: "start",
            report: config.report,
            greeting: config.greeting,
            voiceName: config.voiceName,
            pitch: config.pitch,
            speed: config.speed,
          }));
          resolve();
        };
        socket.addEventListener("error", () => reject(new Error(`Voice relay connection failed (${url}).`)), { once: true });
      });

      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(4096, 1, 1);
      sourceRef.current = source;
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (mutedRef.current || socket.readyState !== WebSocket.OPEN) return;
        const blob = createPcmBlob(event.inputBuffer.getChannelData(0));
        socket.send(JSON.stringify({ type: "audio", data: blob.data, mimeType: blob.mimeType }));
      };
      source.connect(processor);
      processor.connect(inputContext.destination);
    } catch (error) {
      console.error("Voice relay connection failed:", error);
      setError(error instanceof Error ? error.message : "Could not start the voice session.");
      await disconnect();
    }
  }, [clearConnectTimeout, disconnect, drawVisualizer, pushTranscript, stopPlayback]);

  const toggleMute = useCallback(() => {
    setIsMuted((previous) => {
      mutedRef.current = !previous;
      return !previous;
    });
  }, []);

  return {
    isConnected,
    isConnecting,
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

export const VOICE_OPTIONS = [
  { id: "Aoede", label: "Aoede", gender: "Female", desc: "Warm & Professional" },
  { id: "Kore", label: "Kore", gender: "Female", desc: "Calm & Professional" },
  { id: "Zephyr", label: "Zephyr", gender: "Female", desc: "Friendly & Warm" },
  { id: "Puck", label: "Puck", gender: "Male", desc: "Deep & Steady" },
  { id: "Fenrir", label: "Fenrir", gender: "Male", desc: "Authoritative" },
  { id: "Charon", label: "Charon", gender: "Male", desc: "Deep & Resonant" },
] as const;
