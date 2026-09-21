"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Mic, MicOff, Phone, PhoneOff, Activity, Settings, X, Check, Volume2, Sliders, Radio } from 'lucide-react';
import { createPcmBlob, decodeAudio, decodeAudioData } from '../utils/audioUtils';
import { KnowledgeItem, Appointment, CompanyProfile } from '../types';

declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

interface LiveReceptionistProps {
    knowledgeItems: KnowledgeItem[];
    companyProfile: CompanyProfile;
    onBookAppointment: (apt: Appointment) => void;
}

const VOICES = [
    { id: 'Kore', label: 'Kore', gender: 'Female', desc: 'Calm & Professional' },
    { id: 'Zephyr', label: 'Zephyr', gender: 'Female', desc: 'Friendly & Warm' },
    { id: 'Puck', label: 'Puck', gender: 'Male', desc: 'Deep & Steady' },
    { id: 'Fenrir', label: 'Fenrir', gender: 'Male', desc: 'Authoritative' },
    { id: 'Charon', label: 'Charon', gender: 'Male', desc: 'Deep & Resonant' },
];

const LiveReceptionist: React.FC<LiveReceptionistProps> = ({ knowledgeItems, companyProfile, onBookAppointment }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);

    // Voice Settings State
    const [voiceName, setVoiceName] = useState('Kore');
    const [pitch, setPitch] = useState('Normal');
    const [speed, setSpeed] = useState('Normal');
    const [showSettings, setShowSettings] = useState(false);

    // Audio Contexts & Refs
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const sessionRef = useRef<any>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
    // Analyser for visualization
    const analyserRef = useRef<AnalyserNode | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    // Tools Definition
    const tools = useMemo(() => {
        const bookAppointmentTool: FunctionDeclaration = {
            name: 'bookAppointment',
            parameters: {
                type: Type.OBJECT,
                description: 'Book an appointment for a customer.',
                properties: {
                    customerName: { type: Type.STRING, description: 'Name of the customer' },
                    date: { type: Type.STRING, description: 'Date of appointment (YYYY-MM-DD)' },
                    time: { type: Type.STRING, description: 'Time of appointment (HH:MM)' },
                    reason: { type: Type.STRING, description: 'Reason for appointment (optional)' },
                },
                required: ['customerName', 'date', 'time'],
            },
        };
        return [{ functionDeclarations: [bookAppointmentTool] }];
    }, []);

    // Construct System Instruction dynamically
    const systemInstruction = useMemo(() => {
        const voiceStyleInstruction = `
        7. VOICE SETTINGS: The user has requested a specific speaking style.
             - Pitch: ${pitch}
             - Speed: ${speed}
             - Maintain this persona consistently while speaking Malayalam or English.
        `;

        const profileInstruction = `
        COMPANY DETAILS:
        - Name: ${companyProfile.name || "The Company"}
        - Industry: ${companyProfile.industry || "General"}
        - Description: ${companyProfile.description || "A business in Kerala"}
        - Address: ${companyProfile.address || "Kerala"}
        - Contact: ${companyProfile.contactPhone || "Not provided"} / ${companyProfile.contactEmail || "Not provided"}
        `;

        const baseInstruction = `You are Maya, a warm, professional, and efficient AI receptionist for ${companyProfile.name || "us"}, located in ${companyProfile.address || "Kerala"}. 
        1. LANGUAGE: You MUST speak Malayalam fluently. You can also speak English if the user prefers, or mix them (Manglish) for a natural Kerala business feel. 
        2. ROLE: Answer customer queries about the business, services, menu, etc. based on the provided Knowledge Base and Company Details.
        3. BOOKING: If a user wants to book an appointment/table, ask for their Name, Date, and Time, then use the 'bookAppointment' tool.
        4. TONE: Be polite, welcoming. Use phrases like "Namaskaram" (Hello), "Endha vishayam?" (What is the matter?), "Sheri" (Okay).
        5. CONTEXT: You are representing ${companyProfile.name || "the business"}. Always refer to the company as "we" or "us".
        6. KNOWLEDGE BASE: Use the following information to answer questions. If the answer isn't here, politely apologize in Malayalam.
    
        ${profileInstruction}

        ${voiceStyleInstruction}
        `;
    
        const knowledgeText = knowledgeItems.length > 0 
            ? knowledgeItems.map(item => `--- ${item.title} (${item.type}) ---\n${item.content}\n`).join('\n')
            : "No specific documents provided. Rely on Company Details.";

        return `${baseInstruction}\n\nRESOURCE DOCUMENTS:\n${knowledgeText}`;
    }, [knowledgeItems, companyProfile, pitch, speed]);

    const disconnect = async () => {
        if (sessionRef.current) {
                try {
                        sessionRef.current.close();
                } catch (e) {
                        console.error("Error closing session", e);
                }
                sessionRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        if (inputAudioContextRef.current) {
            await inputAudioContextRef.current.close();
            inputAudioContextRef.current = null;
        }
    
        if (outputAudioContextRef.current) {
            await outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }

        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
    
        if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
        }
    
        setIsConnected(false);
        setVolume(0);
    };

    const connect = async () => {
        setError(null);
        setShowSettings(false); 
    
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.NEXT_PUBLIC_API_KEY || process.env.API_KEY;
        if (!apiKey) {
                setError("API Key is missing. Please check your configuration.");
                return;
        }

        try {
            const ai = new GoogleGenAI({ apiKey });
      
            // Audio Setup
            inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Visualization Setup
            const analyser = outputAudioContextRef.current.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;

            // Connect to Gemini Live
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-12-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
                    },
                    systemInstruction: systemInstruction,
                    tools: tools,
                },
                callbacks: {
                    onopen: () => {
                        console.log('Gemini Live Connected');
                        setIsConnected(true);
            
                        // Setup Input Streaming
                        if (!inputAudioContextRef.current || !streamRef.current) return;
            
                        const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
                        const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
                        scriptProcessor.onaudioprocess = (e) => {
                            if (isMuted) return; // Don't send data if muted locally
                            const inputData = e.inputBuffer.getChannelData(0);
                            const pcmBlob = createPcmBlob(inputData);
                            sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };
            
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                         // Handle Function Calls
                         if (message.toolCall) {
                                console.log("Tool Call Received:", message.toolCall);
                                for (const fc of message.toolCall.functionCalls) {
                                        if (fc.name === 'bookAppointment') {
                                                const args = fc.args as any;
                                                const newApt: Appointment = {
                                                        id: Math.random().toString(36).substring(7),
                                                        customerName: args.customerName,
                                                        date: args.date,
                                                        time: args.time,
                                                        reason: args.reason,
                                                        status: 'confirmed'
                                                };
                                                onBookAppointment(newApt);
                        
                                                sessionPromise.then(session => session.sendToolResponse({
                                                        functionResponses: {
                                                                id: fc.id,
                                                                name: fc.name,
                                                                response: { result: "Appointment Booked Successfully" }
                                                        }
                                                }));
                                        }
                                }
                         }

                         // Handle Audio Output
                         const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                         if (base64Audio && outputAudioContextRef.current) {
                                const ctx = outputAudioContextRef.current;
                                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                
                                const audioBuffer = await decodeAudioData(
                                        decodeAudio(base64Audio),
                                        ctx,
                                        24000,
                                        1
                                );
                
                                const source = ctx.createBufferSource();
                                source.buffer = audioBuffer;
                
                                if (analyserRef.current) {
                                        source.connect(analyserRef.current);
                                        analyserRef.current.connect(ctx.destination);
                                } else {
                                        source.connect(ctx.destination);
                                }

                                source.addEventListener('ended', () => {
                                        sourcesRef.current.delete(source);
                                });

                                source.start(nextStartTimeRef.current);
                                nextStartTimeRef.current += audioBuffer.duration;
                                sourcesRef.current.add(source);
                         }

                         if (message.serverContent?.interrupted) {
                                sourcesRef.current.forEach(src => src.stop());
                                sourcesRef.current.clear();
                                nextStartTimeRef.current = 0;
                         }
                    },
                    onclose: () => {
                        console.log("Session Closed");
                        setIsConnected(false);
                    },
                    onerror: (err) => {
                        console.error("Gemini Error:", err);
                        setError("Connection error. Please try again.");
                        disconnect();
                    }
                }
            });
      
            sessionRef.current = await sessionPromise;
            drawVisualizer();

        } catch (err: any) {
            console.error("Connection Failed:", err);
            setError(err.message || "Failed to connect to AI service.");
            disconnect();
        }
    };

    const drawVisualizer = () => {
        if (!analyserRef.current || !canvasRef.current) return;
    
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
                if (!isConnected) return;
                animationFrameRef.current = requestAnimationFrame(draw);
        
                analyserRef.current!.getByteFrequencyData(dataArray);
        
                let sum = 0;
                for(let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i];
                }
                setVolume(sum / bufferLength);

                ctx.fillStyle = 'rgb(248, 250, 252)'; // slate-50
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const barWidth = (canvas.width / bufferLength) * 2.5;
                let barHeight;
                let x = 0;

                for(let i = 0; i < bufferLength; i++) {
                        barHeight = dataArray[i] / 1.5;
                        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                        gradient.addColorStop(0, '#10b981'); // Emerald 500
                        gradient.addColorStop(1, '#059669'); // Emerald 600
                        ctx.fillStyle = gradient;
                        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                        x += barWidth + 1;
                }
        };
        draw();
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };
  const renderSettings = () => (
    <div className="absolute inset-0 bg-white z-20 flex flex-col animate-in slide-in-from-bottom-5 duration-300">
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-600" />
                Voice Settings
            </h3>
            <button 
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
            >
                <X className="w-5 h-5" />
            </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Voice Selection */}
            <div>
                <label className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">Select Voice Persona</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {VOICES.map((v) => (
                        <button
                            key={v.id}
                            onClick={() => setVoiceName(v.id)}
                            className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left group ${
                                voiceName === v.id 
                                ? 'border-emerald-500 bg-emerald-50/50' 
                                : 'border-slate-100 hover:border-emerald-200 hover:bg-slate-50'
                            }`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                voiceName === v.id ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-100 group-hover:text-emerald-600'
                            }`}>
                                <Radio className={`w-5 h-5 ${voiceName === v.id ? 'fill-current' : ''}`} />
                            </div>
                            <div>
                                <div className="font-bold text-slate-900">{v.label}</div>
                                <div className="text-xs text-slate-500 mt-0.5 font-medium">{v.gender} • {v.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Pitch Selection */}
            <div>
                 <label className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">Pitch</label>
                 <div className="flex bg-slate-100 p-1.5 rounded-xl">
                    {['Low', 'Normal', 'High'].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPitch(p)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                pitch === p 
                                ? 'bg-white text-slate-900 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {p}
                        </button>
                    ))}
                 </div>
            </div>

            {/* Speed Selection */}
            <div>
                 <label className="block text-xs font-bold text-slate-400 mb-4 uppercase tracking-wider">Speaking Speed</label>
                 <div className="flex bg-slate-100 p-1.5 rounded-xl">
                    {['Slow', 'Normal', 'Fast'].map((s) => (
                        <button
                            key={s}
                            onClick={() => setSpeed(s)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                                speed === s 
                                ? 'bg-white text-slate-900 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {s}
                        </button>
                    ))}
                 </div>
            </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50">
            <button 
                onClick={() => setShowSettings(false)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 transform active:scale-[0.98]"
            >
                Apply Settings
            </button>
        </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
       <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 md:p-8">
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden flex flex-col flex-1 relative">
                
                {/* Header */}
                <div className="bg-white/80 backdrop-blur-md px-8 py-5 flex justify-between items-center border-b border-slate-100 z-10 absolute top-0 left-0 right-0">
                    <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="font-bold text-slate-700 text-sm tracking-wide uppercase">
                            {isConnected ? 'Live Session Active' : 'Offline'}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-xs text-slate-400 font-bold tracking-widest hidden sm:block">GEMINI 2.5 MULTIMODAL</div>
                        {!isConnected && (
                            <button 
                                onClick={() => setShowSettings(!showSettings)}
                                className="p-2.5 hover:bg-slate-100 rounded-full text-slate-600 transition-colors"
                                title="Voice Settings"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Main Visualizer Area */}
                <div className="flex-1 relative bg-slate-50 flex items-center justify-center">
                    {showSettings && renderSettings()}

                    {!showSettings && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                            {!isConnected ? (
                                <div className="text-center animate-in zoom-in duration-300">
                                    <div className="w-32 h-32 bg-gradient-to-br from-emerald-100 to-teal-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner relative">
                                        <div className="absolute inset-0 rounded-full border border-emerald-200 opacity-50"></div>
                                        <Phone className="w-12 h-12 text-emerald-600" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-slate-900 mb-3">Start Live Receptionist</h3>
                                    <p className="text-slate-500 max-w-md mx-auto mb-8 text-lg">
                                        Connect to Maya to handle customer queries and bookings for <span className="font-semibold text-slate-800">{companyProfile.name}</span>.
                                    </p>
                                    
                                    <div className="flex flex-wrap justify-center gap-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm flex items-center gap-2">
                                            <Volume2 className="w-3 h-3" /> {voiceName}
                                        </span>
                                        <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
                                            {pitch} Pitch
                                        </span>
                                        <span className="px-3 py-1.5 bg-white border border-slate-200 rounded-full shadow-sm">
                                            {speed} Speed
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <canvas 
                                    ref={canvasRef} 
                                    width={800} 
                                    height={400} 
                                    className="w-full h-full object-cover opacity-80"
                                />
                            )}
                            
                            {isConnected && (
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-all duration-300">
                                    <div className={`rounded-full p-2 bg-white/30 backdrop-blur-sm transition-all duration-100 ${volume > 10 ? 'scale-110 shadow-2xl shadow-emerald-400/40' : 'scale-100 shadow-xl'}`}>
                                        <img 
                                            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${voiceName}&backgroundColor=10b981`}
                                            alt="AI Avatar" 
                                            className="w-32 h-32 rounded-full bg-white"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="p-8 bg-white border-t border-slate-100 flex justify-center items-center gap-8 relative z-20">
                    {!isConnected ? (
                        <button 
                            onClick={connect}
                            disabled={showSettings}
                            className="flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-emerald-200 hover:shadow-emerald-300 transition-all transform hover:-translate-y-1 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Phone className="w-6 h-6" /> Connect Line
                        </button>
                    ) : (
                        <>
                            <button 
                                onClick={toggleMute}
                                className={`p-6 rounded-full transition-all duration-200 ${
                                    isMuted 
                                    ? 'bg-red-50 text-red-500 hover:bg-red-100 ring-2 ring-red-100' 
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 ring-2 ring-transparent'
                                }`}
                            >
                                {isMuted ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                            </button>
                            
                            <button 
                                onClick={disconnect}
                                className="bg-red-500 hover:bg-red-600 text-white px-10 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-red-200 hover:shadow-red-300 transition-all flex items-center gap-3 transform hover:-translate-y-1 active:scale-[0.98]"
                            >
                                <PhoneOff className="w-6 h-6" /> End Session
                            </button>
                        </>
                    )}
                </div>
                {error && (
                    <div className="px-8 pb-6 text-sm text-red-700">
                        {error}
                    </div>
                )}
            </div>
       </div>
    </div>
  );
};

export default LiveReceptionist;