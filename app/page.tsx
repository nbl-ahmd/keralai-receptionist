"use client";

import { useMemo, useState, useRef, useCallback } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Brain,
  Building2,
  CalendarClock,
  CheckCircle2,
  Database,
  Headset,
  LineChart,
  Mic,
  PhoneCall,
  Plus,
  Rocket,
  Sparkles,
  UploadCloud,
  Users,
  Loader2,
  AlertTriangle,
  Download,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Appointment, CompanyProfile, KnowledgeItem } from "@/types";
import LiveReceptionist from "@/components/LiveReceptionist";
import { GoogleGenAI } from "@google/genai";

export default function HomePage() {
  const [profile, setProfile] = useState<CompanyProfile>({
    name: "",
    industry: "",
    description: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
  });
  const [appointments, setAppointments] = useState<Appointment[]>([
    {
      id: crypto.randomUUID(),
      customerName: "Isha Varma",
      date: new Date().toISOString().slice(0, 10),
      time: "10:30",
      reason: "Consultation",
      status: "confirmed",
    },
    {
      id: crypto.randomUUID(),
      customerName: "Arjun Nair",
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      time: "14:00",
      reason: "Follow-up call",
      status: "pending",
    },
    {
      id: crypto.randomUUID(),
      customerName: "Meera Joseph",
      date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
      time: "09:15",
      reason: "On-site visit",
      status: "confirmed",
    },
  ]);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "knowledge" | "voice">("overview");
  const [voice, setVoice] = useState("Maya / Emerald");
  const [tone, setTone] = useState("Warm");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState<KnowledgeItem["type"]>("text");
  const [newDocContent, setNewDocContent] = useState("");
  const [showVoiceConsole, setShowVoiceConsole] = useState(false);
  const [voiceAutoConnect, setVoiceAutoConnect] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [banner, setBanner] = useState<{ message: string; tone: "info" | "success" | "warn" } | null>(null);
  const bannerTimeoutRef = useRef<number | NodeJS.Timeout | null>(null);
  const [callLog, setCallLog] = useState(
    [
      {
        caller: "Priya",
        intent: "Table booking",
        outcome: "Booked",
        duration: "3:12",
        timestamp: "Today 09:40",
      },
      {
        caller: "Rahul",
        intent: "Pricing",
        outcome: "Answered",
        duration: "2:02",
        timestamp: "Today 08:55",
      },
      {
        caller: "Anita",
        intent: "Support",
        outcome: "Escalated",
        duration: "4:30",
        timestamp: "Yesterday",
      },
    ] satisfies { caller: string; intent: string; outcome: string; duration: string; timestamp: string }[]
  );

  const triggerBanner = useCallback(
    (message: string, tone: "info" | "success" | "warn" = "info") => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current as number);
      }
      setBanner({ message, tone });
      bannerTimeoutRef.current = window.setTimeout(() => setBanner(null), 3200);
    },
    []
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsePreview, setParsePreview] = useState<{ content: string; title: string; type: KnowledgeItem["type"]; fileName?: string } | null>(null);
  const [parseProfile, setParseProfile] = useState<Partial<CompanyProfile> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  };

  const analyzeFileWithAI = async (file: File) => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      throw new Error("Missing NEXT_PUBLIC_GOOGLE_API_KEY in environment.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const modelName = process.env.NEXT_PUBLIC_GENAI_MODEL || process.env.GENAI_MODEL || "models/gemini-2.0-flash-lite-001";
    const base64Data = await fileToBase64(file);

    const prompt = `You are an expert business data extraction AI.
Analyze the provided file (any type: PDF, doc, image, csv, txt). Return STRICT JSON only:
{
  "knowledge_content": "Detailed, structured plain-text summary with bullet lists for services/products/pricing/hours/policies/contacts.",
  "company_profile": {
    "name": "Business name or null",
    "industry": "Industry or null",
    "description": "Short description or null",
    "address": "Full address or null",
    "contactPhone": "Phone number or null",
    "contactEmail": "Email or null"
  }
}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { mimeType: file.type || "application/octet-stream", data: base64Data } },
          { text: prompt },
        ],
      },
    });

    const rawText = response.text || "{}";
    const jsonStr = rawText.replace(/```json|```/g, "").trim();
    let data: unknown;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw new Error("Could not parse AI response. Please try a clearer file.");
    }
    const parsed = data as {
      knowledge_content?: string;
      company_profile?: Partial<CompanyProfile>;
    };
    return parsed;
  };

  const metrics = useMemo(
    () => [
      {
        label: "Service level",
        value: "99.2%",
        helper: "answer rate",
        icon: <Headset className="h-4 w-4" />,
      },
      {
        label: "Bookings",
        value: appointments.length.toString().padStart(2, "0"),
        helper: "today",
        icon: <CalendarClock className="h-4 w-4" />,
      },
      {
        label: "Knowledge",
        value: knowledgeBase.length.toString().padStart(2, "0"),
        helper: "assets",
        icon: <Database className="h-4 w-4" />,
      },
      {
        label: "NPS",
        value: "72",
        helper: "rolling 7d",
        icon: <LineChart className="h-4 w-4" />,
      },
    ],
    [appointments.length, knowledgeBase.length]
  );

  const analyticsKPIs = useMemo(
    () => [
      { label: "Voice CSAT", value: "4.7", helper: "avg / 5" },
      { label: "First-contact resolution", value: "92%", helper: "rolling 7d" },
      { label: "Avg handle", value: "2m 18s", helper: "per call" },
      { label: "Escalation", value: "6%", helper: "needs human" },
    ],
    []
  );

  const conversionFunnel = useMemo(
    () => [
      { stage: "Calls answered", count: 142, rate: 0.94 },
      { stage: "Qualified", count: 118, rate: 0.83 },
      { stage: "Booked", count: appointments.length + 32, rate: 0.72 },
      { stage: "Showed", count: 97, rate: 0.66 },
    ],
    [appointments.length]
  );

  const addKnowledgeItem = () => {
    if (!newDocTitle.trim() || !newDocContent.trim()) return;
    const item: KnowledgeItem = {
      id: crypto.randomUUID(),
      title: newDocTitle,
      type: newDocType,
      content: newDocContent,
      dateAdded: new Date(),
    };
    setKnowledgeBase((prev) => [item, ...prev]);
    setNewDocContent("");
    setNewDocTitle("");
  };
  const handleFileSelect = async (file?: File | null) => {
    if (!file) return;
    setIsFileLoading(true);
    setParseError(null);
    setParsePreview(null);
    setParseProfile(null);

    const inferredType: KnowledgeItem["type"] = file.type.includes("pdf")
      ? "pdf"
      : file.type.includes("image")
        ? "image"
        : file.type.includes("csv")
          ? "doc"
          : "doc";

    try {
      setIsParsing(true);
      const data = await analyzeFileWithAI(file);
      const content = data.knowledge_content || "";
      const titleFromName = file.name.replace(/\.[^.]+$/, "") || file.name;

      if (!content) {
        setParseError("AI could not extract content. Please try another file or paste text manually.");
      }

      setParsePreview({
        content: content || "",
        title: titleFromName,
        type: inferredType,
        fileName: file.name,
      });

      if (data.company_profile) {
        setParseProfile(data.company_profile);
        setProfile((prev) => ({
          name: data.company_profile?.name || prev.name,
          industry: data.company_profile?.industry || prev.industry,
          description: data.company_profile?.description || prev.description,
          address: data.company_profile?.address || prev.address,
          contactPhone: data.company_profile?.contactPhone || prev.contactPhone,
          contactEmail: data.company_profile?.contactEmail || prev.contactEmail,
        }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed. Try again.";
      setParseError(message);
    } finally {
      setIsParsing(false);
      setIsFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerFileDialog = () => {
    fileInputRef.current?.click();
  };

  const saveParsedToKnowledge = () => {
    if (!parsePreview || !parsePreview.content.trim()) return;
    const item: KnowledgeItem = {
      id: crypto.randomUUID(),
      title: parsePreview.title || "Uploaded Resource",
      type: parsePreview.type,
      content: parsePreview.content,
      dateAdded: new Date(),
      fileName: parsePreview.fileName,
    };
    setKnowledgeBase((prev) => [item, ...prev]);
    setParsePreview(null);
    setParseProfile(null);
    setParseError(null);
  };

  const applyParsedProfile = () => {
    if (!parseProfile) return;
    setProfile((prev) => ({
      name: parseProfile.name || prev.name,
      industry: parseProfile.industry || prev.industry,
      description: parseProfile.description || prev.description,
      address: parseProfile.address || prev.address,
      contactPhone: parseProfile.contactPhone || prev.contactPhone,
      contactEmail: parseProfile.contactEmail || prev.contactEmail,
    }));
  };

  const bookQuickCall = () => {
    const newBooking: Appointment = {
      id: crypto.randomUUID(),
      customerName: "Walk-in lead",
      date: new Date().toISOString().slice(0, 10),
      time: "Immediate",
      reason: "Instant callback from concierge",
      status: "pending",
    };
    setAppointments((prev) => [newBooking, ...prev]);
    setCallLog((prev) => [
      {
        caller: "Walk-in lead",
        intent: "Callback",
        outcome: "Queued",
        duration: "—",
        timestamp: "Just now",
      },
      ...prev.slice(0, 19),
    ]);
    triggerBanner("Queued an instant callback", "success");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 pb-6 pt-8 lg:pt-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-lg font-bold text-white shadow-md">
            KA
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-700">Reception OS</p>
            <h1 className="text-2xl font-bold text-slate-900">KeralAI Enterprise Desk</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="gap-2 text-slate-600"
            onClick={() => triggerBanner("All systems nominal. No open alerts.")}
          >
            <Bell className="h-4 w-4" /> Alerts
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => triggerBanner("Deploy triggered. CDN and voice edge refreshing.", "success")}
          >
            <UploadCloud className="h-4 w-4" /> Deploy updates
          </Button>
        </div>
      </header>

      {banner && (
        <div
          className={cn(
            "mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-2xl border px-4 py-3 text-sm shadow-sm",
            banner.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            banner.tone === "info" && "border-slate-200 bg-white text-slate-800",
            banner.tone === "warn" && "border-amber-200 bg-amber-50 text-amber-800"
          )}
        >
          <span>{banner.message}</span>
          <button
            className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            onClick={() => setBanner(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="mx-auto grid max-w-7xl gap-6 px-4 pb-12 lg:grid-cols-[280px_1fr]">
        <aside className="glass-panel hidden h-fit lg:block">
          <div className="border-b border-white/60 px-5 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Live Concierge</p>
                <p className="text-lg font-semibold text-slate-900">Maya is online</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <Mic className="h-4 w-4" />
              </div>
            </div>
          </div>
          <nav className="space-y-1.5 px-3 py-5">
            {[
              { key: "overview", label: "Command overview", icon: Rocket },
              { key: "knowledge", label: "Knowledge ops", icon: Database },
              { key: "voice", label: "Voice console", icon: Headset },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key as typeof activeTab)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition-all",
                  activeTab === item.key
                    ? "bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-700 ring-1 ring-emerald-200"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                <ArrowUpRight className="ml-auto h-4 w-4 opacity-60" />
              </button>
            ))}
          </nav>

          <div className="mx-3 mb-4 rounded-2xl bg-slate-900 px-4 py-5 text-white">
            <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Signal</p>
            <p className="mt-2 text-lg font-semibold">Real-time operations</p>
            <p className="mt-1 text-sm text-slate-200">
              Live agent, knowledge gap detection, and appointment sync in one console.
            </p>
            <div className="mt-4 flex items-center gap-2 text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold uppercase">Active</span>
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <Card className="glass-panel overflow-hidden border-0">
            <div className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-emerald-400 to-sky-500" />
              <div className="relative flex flex-col gap-6 px-6 pb-6 pt-7 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl text-white">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-50">
                    <Sparkles className="h-4 w-4" /> Premium concierge ready
                  </div>
                  <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
                    Voice-native receptionist with Kerala hospitality built-in.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm text-emerald-50">
                    Route calls, answer in Malayalam or English, and book appointments directly from your knowledge base.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Badge className="bg-white/20 text-white">HIPAA-ready</Badge>
                    <Badge className="bg-white/20 text-white">Webhook integrations</Badge>
                    <Badge className="bg-white/20 text-white">24/7 uptime</Badge>
                  </div>
                </div>
                <div className="glass-panel gradient-border w-full max-w-sm bg-white/90 text-slate-900">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                      Live status
                      <Badge variant="default" className="bg-emerald-100 text-emerald-700">
                        Connected
                      </Badge>
                    </div>
                    <div className="mt-4 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-inner">
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.15em] text-emerald-200">
                        Audio stream
                        <span className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Healthy
                        </span>
                      </div>
                      <div className="mt-4 h-16 rounded-xl bg-gradient-to-r from-emerald-500/60 via-sky-500/60 to-indigo-500/60" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-semibold text-slate-800">
                      <Button
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => {
                          setVoiceAutoConnect(true);
                          setShowVoiceConsole(true);
                        }}
                      >
                        <PhoneCall className="h-4 w-4" /> Start concierge
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 text-slate-700"
                        onClick={() => {
                          setVoiceAutoConnect(false);
                          setShowVoiceConsole(true);
                        }}
                      >
                        <Activity className="h-4 w-4" /> Observe
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <Card key={metric.label} className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardDescription className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {metric.label}
                  </CardDescription>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    {metric.icon}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-slate-900">{metric.value}</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {metric.helper}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Analytics</CardTitle>
                <CardDescription>Voice quality, CSAT, and routing stability.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {analyticsKPIs.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-100 p-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                    <p className="text-sm text-slate-500">{item.helper}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-start justify-between">
                <div>
                  <CardTitle>Conversion funnel</CardTitle>
                  <CardDescription>From answered calls to show-ups.</CardDescription>
                </div>
                <Badge variant="accent">Realtime</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {conversionFunnel.map((step, idx) => (
                  <div key={step.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                      <span>{idx + 1}. {step.stage}</span>
                      <span>{step.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        style={{ width: `${Math.min(step.rate * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">{Math.round(step.rate * 100)}% retention</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex items-start justify-between">
                <div>
                  <CardTitle>Recent calls</CardTitle>
                  <CardDescription>Live receptionist outcomes.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => triggerBanner("Exporting call log as CSV", "success")}>
                  <Download className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[240px] pr-4">
                  <div className="space-y-3">
                    {callLog.map((log, idx) => (
                      <div key={idx} className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                          <span>{log.caller}</span>
                          <span className="text-xs text-slate-500">{log.timestamp}</span>
                        </div>
                        <p className="text-sm text-slate-600">{log.intent}</p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                          <Badge variant="secondary" className="capitalize">{log.outcome}</Badge>
                          <span>Duration: {log.duration}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-xl">Appointments & routing</CardTitle>
                  <CardDescription>AI-booked meetings in real time.</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={bookQuickCall}>
                  <Plus className="h-4 w-4" /> Quick callback
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Guest</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Time</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {appointments.map((apt) => (
                        <tr key={apt.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{apt.customerName}</td>
                          <td className="px-4 py-3 text-slate-700">{apt.date}</td>
                          <td className="px-4 py-3 text-slate-700">{apt.time}</td>
                          <td className="px-4 py-3 text-slate-600">{apt.reason || "—"}</td>
                          <td className="px-4 py-3">
                            <Badge variant={apt.status === "confirmed" ? "default" : apt.status === "pending" ? "accent" : "secondary"}>
                              {apt.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-b from-slate-900 to-slate-950 text-white">
              <CardHeader>
                <CardDescription className="text-emerald-200">AI concierge health</CardDescription>
                <CardTitle className="text-2xl text-white">24/7 reliability layer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="flex items-center justify-between text-sm text-emerald-100">
                    <span>Latency</span>
                    <span className="font-semibold">142 ms</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/10">
                    <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                  <div className="flex items-center justify-between text-sm text-emerald-100">
                    <span>Fallback coverage</span>
                    <span className="font-semibold">Global</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">
                    Auto-routes to backup voice if Gemini is degraded. SIP + PSTN supported.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="justify-between border-t border-white/10 text-sm text-emerald-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> SLA locked
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white text-slate-900"
                  onClick={() => triggerBanner("Audit exported for compliance", "success")}
                >
                  Export audit
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-card overflow-hidden">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <CardTitle>Knowledge operations</CardTitle>
                  <CardDescription>Structured content powering Maya.</CardDescription>
                </div>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full sm:w-auto">
                  <TabsList className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                    <TabsTrigger value="overview" className="flex-1 sm:flex-none">Overview</TabsTrigger>
                    <TabsTrigger value="knowledge" className="flex-1 sm:flex-none">Resources</TabsTrigger>
                    <TabsTrigger value="voice" className="flex-1 sm:flex-none">Voice</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
                  <TabsContent value="overview" className="space-y-4">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-start gap-3">
                        <Brain className="h-5 w-5 text-emerald-600" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Context coverage</p>
                          <p className="text-sm text-slate-600">
                            {knowledgeBase.length === 0
                              ? "No resources uploaded yet. Add PDFs, images, or docs to power Maya."
                              : `Using ${knowledgeBase.length} knowledge assets to answer questions and route bookings.`}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {knowledgeBase.slice(0, 2).map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-100 p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <Badge variant="secondary" className="capitalize">
                                {item.type}
                              </Badge>
                              {item.title}
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-slate-400" />
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{item.content}</p>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="knowledge" className="space-y-4">
                    <div className="rounded-2xl border border-slate-100 p-4 space-y-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Upload or paste</p>
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <Input
                          placeholder="Document title"
                          value={newDocTitle}
                          onChange={(e) => setNewDocTitle(e.target.value)}
                          className="min-w-[220px] flex-1"
                        />
                        <Select value={newDocType} onValueChange={(v) => setNewDocType(v as KnowledgeItem["type"]) }>
                          <SelectTrigger className="sm:w-40">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="link">Link</SelectItem>
                            <SelectItem value="pdf">PDF</SelectItem>
                            <SelectItem value="image">Image</SelectItem>
                            <SelectItem value="doc">Doc</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button className="sm:w-40" onClick={addKnowledgeItem}>
                          <Plus className="h-4 w-4" /> Add
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                        <input
                          type="file"
                          ref={fileInputRef}
                          className="hidden"
                          accept=".pdf,.doc,.docx,.txt,.csv,image/*"
                          onChange={(e) => handleFileSelect(e.target.files?.[0])}
                        />
                        <Button variant="outline" className="gap-2 sm:w-60" onClick={triggerFileDialog} disabled={isFileLoading || isParsing}>
                          <UploadCloud className="h-4 w-4" /> {isParsing ? "Parsing with AI..." : isFileLoading ? "Uploading..." : "Upload PDF / Doc / Image"}
                        </Button>
                        <p className="text-xs text-slate-500 leading-relaxed">Supports PDF, DOC/DOCX, TXT, CSV, JPG/PNG. AI extracts and lets you edit before saving.</p>
                      </div>
                      <Textarea
                        className="mt-1"
                        rows={4}
                        placeholder="Paste procedures, menu items, SLAs, or pricing."
                        value={newDocContent}
                        onChange={(e) => setNewDocContent(e.target.value)}
                      />
                      {parseError && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                          <AlertTriangle className="h-4 w-4" /> {parseError}
                        </div>
                      )}
                      {isParsing && (
                        <div className="flex items-center gap-2 text-sm text-emerald-700">
                          <Loader2 className="h-4 w-4 animate-spin" /> Parsing file with AI...
                        </div>
                      )}
                      {parsePreview && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">AI parsed draft</p>
                              <p className="text-sm text-slate-600">Review and edit before saving to the knowledge base.</p>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => { setParsePreview(null); setParseProfile(null); setParseError(null); }}>Discard</Button>
                              <Button size="sm" onClick={saveParsedToKnowledge}>Save to knowledge base</Button>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Title</p>
                              <Input value={parsePreview.title} onChange={(e) => setParsePreview({ ...parsePreview, title: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Type</p>
                              <Select value={parsePreview.type} onValueChange={(v) => setParsePreview({ ...parsePreview, type: v as KnowledgeItem["type"] })}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="link">Link</SelectItem>
                                  <SelectItem value="pdf">PDF</SelectItem>
                                  <SelectItem value="image">Image</SelectItem>
                                  <SelectItem value="doc">Doc</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Content</p>
                            <Textarea rows={6} value={parsePreview.content} onChange={(e) => setParsePreview({ ...parsePreview, content: e.target.value })} />
                            {parsePreview.fileName && <p className="text-xs text-slate-500">File: {parsePreview.fileName}</p>}
                          </div>
                          {parseProfile && (
                            <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Suggested company profile</p>
                                <Button size="sm" variant="secondary" onClick={applyParsedProfile}>Apply to profile</Button>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <p className="text-sm text-emerald-900">Name: {parseProfile.name || "—"}</p>
                                <p className="text-sm text-emerald-900">Industry: {parseProfile.industry || "—"}</p>
                                <p className="text-sm text-emerald-900">Email: {parseProfile.contactEmail || "—"}</p>
                                <p className="text-sm text-emerald-900">Phone: {parseProfile.contactPhone || "—"}</p>
                                <p className="text-sm text-emerald-900">Address: {parseProfile.address || "—"}</p>
                                <p className="text-sm text-emerald-900 sm:col-span-2">Description: {parseProfile.description || "—"}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <ScrollArea className="h-[260px] rounded-2xl border border-slate-100">
                      <div className="divide-y divide-slate-100">
                        {knowledgeBase.map((item) => (
                          <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                            <Badge variant="secondary" className="capitalize">
                              {item.type}
                            </Badge>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                              <p className="text-sm text-slate-600">{item.content}</p>
                              {item.fileName && (
                                <p className="text-xs text-slate-400 mt-0.5">File: {item.fileName}</p>
                              )}
                            </div>
                            <span className="text-xs text-slate-400">
                              {item.dateAdded.toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="voice" className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Voice persona</p>
                        <Select value={voice} onValueChange={setVoice}>
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Maya / Emerald">Maya • Emerald (warm)</SelectItem>
                            <SelectItem value="Charon / Deep">Charon • Deep (authoritative)</SelectItem>
                            <SelectItem value="Zephyr / Breeze">Zephyr • Breeze (friendly)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-sm text-slate-600">
                          Tuned for Malayalam + English, with enterprise-grade clarity and barge-in support.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tone</p>
                        <Select value={tone} onValueChange={setTone}>
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Warm">Warm + Empathetic</SelectItem>
                            <SelectItem value="Concise">Concise + Transactional</SelectItem>
                            <SelectItem value="Premium">Premium + White-glove</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-sm text-slate-600">
                          Maya mirrors this tone across Malayalam and English responses.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                      <div className="flex items-center gap-2 font-semibold">
                        <Building2 className="h-4 w-4" /> Company Profile
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <Input
                          value={profile.name}
                          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                          placeholder="Brand name"
                        />
                        <Input
                          value={profile.industry}
                          onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                          placeholder="Industry"
                        />
                        <Input
                          value={profile.contactEmail}
                          onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
                          placeholder="Email"
                        />
                        <Input
                          value={profile.contactPhone}
                          onChange={(e) => setProfile({ ...profile, contactPhone: e.target.value })}
                          placeholder="Phone"
                        />
                      </div>
                      <Textarea
                        className="mt-3"
                        rows={3}
                        value={profile.description}
                        onChange={(e) => setProfile({ ...profile, description: e.target.value })}
                        placeholder="Brand story and service promise."
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>Concierge feed</CardTitle>
                  <CardDescription>Signals from the last 30 minutes.</CardDescription>
                </div>
                <Badge variant="accent" className="gap-1">
                  <Sparkles className="h-4 w-4" /> Live
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      icon: <PhoneCall className="h-4 w-4 text-emerald-600" />,
                      title: "Call transferred to Maya",
                      desc: "Routed Malayalam-speaking guest to concierge persona.",
                      user: "Mini Joseph",
                    },
                    {
                      icon: <Database className="h-4 w-4 text-sky-600" />,
                      title: "Knowledge gap patched",
                      desc: "Added conference seating map from PDF.",
                      user: "Ops Bot",
                    },
                    {
                      icon: <Users className="h-4 w-4 text-indigo-600" />,
                      title: "Team handoff",
                      desc: "Escalated to on-site manager for VIP arrival.",
                      user: "Duty Manager",
                    },
                  ].map((event, idx) => (
                    <div key={idx} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50">
                        {event.icon}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                        <p className="text-sm text-slate-600">{event.desc}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <Avatar initials={event.user.slice(0, 2).toUpperCase()} className="h-8 w-8 text-[10px]" />
                          {event.user}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {showVoiceConsole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <Button
              variant="secondary"
              className="bg-white"
              onClick={() => {
                setShowVoiceConsole(false);
                setVoiceAutoConnect(false);
              }}
            >
              Close console
            </Button>
          </div>
          <div className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl">
            <LiveReceptionist
              knowledgeItems={knowledgeBase}
              companyProfile={profile}
              onBookAppointment={(apt) => {
                setAppointments((prev) => [apt, ...prev]);
                setCallLog((prev) => [
                  {
                    caller: apt.customerName || "Guest",
                    intent: apt.reason || "Booking",
                    outcome: "Booked",
                    duration: "—",
                    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  },
                  ...prev.slice(0, 19),
                ]);
                triggerBanner("Appointment booked from live call", "success");
              }}
              autoConnect={voiceAutoConnect}
              onAutoConnectHandled={() => setVoiceAutoConnect(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
