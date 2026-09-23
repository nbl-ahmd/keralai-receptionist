"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Brain,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  Headset,
  Loader2,
  MessageSquarePlus,
  Mic,
  PhoneCall,
  Plus,
  Plug,
  RefreshCw,
  Rocket,
  Send,
  Settings2,
  Trash2,
  UploadCloud,
  User,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  Appointment,
  BookingSettings,
  CallRecord,
  CompanyProfile,
  Contact,
  CrmStatus,
  KnowledgeChatMessage,
  KnowledgeItem,
} from "@/types";
import LiveReceptionist from "@/components/LiveReceptionist";

type TabKey = "overview" | "calls" | "knowledge" | "voice";

const EMPTY_PROFILE: CompanyProfile = {
  name: "",
  industry: "",
  description: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
};

const OUTCOME_STYLES: Record<CallRecord["outcome"], string> = {
  booked: "bg-emerald-100 text-emerald-800",
  answered: "bg-sky-100 text-sky-800",
  escalated: "bg-amber-100 text-amber-800",
  missed: "bg-red-100 text-red-700",
  abandoned: "bg-slate-200 text-slate-700",
  "in-progress": "bg-indigo-100 text-indigo-800",
};

function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function HomePage() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [crmStatus, setCrmStatus] = useState<CrmStatus | null>(null);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [callFilter, setCallFilter] = useState<"all" | CallRecord["outcome"]>("all");

  const [voice, setVoice] = useState("Maya / Emerald");
  const [tone, setTone] = useState("Warm");
  const [showVoiceConsole, setShowVoiceConsole] = useState(false);
  const [voiceAutoConnect, setVoiceAutoConnect] = useState(false);

  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocType, setNewDocType] = useState<KnowledgeItem["type"]>("text");
  const [newDocContent, setNewDocContent] = useState("");
  const [isSavingDoc, setIsSavingDoc] = useState(false);

  const [chatMessages, setChatMessages] = useState<KnowledgeChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsePreview, setParsePreview] = useState<{
    content: string;
    title: string;
    type: KnowledgeItem["type"];
    fileName?: string;
  } | null>(null);
  const [parseProfile, setParseProfile] = useState<Partial<CompanyProfile> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [banner, setBanner] = useState<{ message: string; tone: "info" | "success" | "warn" } | null>(null);
  const bannerTimeoutRef = useRef<number | NodeJS.Timeout | null>(null);
  // Avoid clobbering in-progress profile edits during background polling.
  const profileDirtyRef = useRef(false);

  const triggerBanner = useCallback((message: string, tone: "info" | "success" | "warn" = "info") => {
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current as number);
    setBanner({ message, tone });
    bannerTimeoutRef.current = window.setTimeout(() => setBanner(null), 3200);
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadAll = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const [profileRes, knowledgeRes, appointmentsRes, callsRes, metricsRes, contactsRes] =
          await Promise.all([
            fetch("/api/company-profile").then((r) => r.json()),
            fetch("/api/knowledge").then((r) => r.json()),
            fetch("/api/appointments").then((r) => r.json()),
            fetch("/api/calls").then((r) => r.json()),
            fetch("/api/metrics").then((r) => r.json()),
            fetch("/api/contacts").then((r) => r.json()),
          ]);

        if (profileRes && !profileRes.error && !profileDirtyRef.current) {
          setProfile({ ...EMPTY_PROFILE, ...profileRes });
        }
        if (Array.isArray(knowledgeRes)) {
          setKnowledgeBase(
            knowledgeRes.map((item: KnowledgeItem) => ({ ...item, dateAdded: toDate(item.dateAdded) })),
          );
        }
        if (Array.isArray(appointmentsRes)) setAppointments(appointmentsRes);
        if (Array.isArray(callsRes)) setCalls(callsRes);
        if (Array.isArray(contactsRes)) setContacts(contactsRes);
        if (metricsRes && !metricsRes.error) {
          setCrmStatus(metricsRes.crm ?? null);
          setBookingSettings(metricsRes.booking ?? null);
        }
        setLastSynced(new Date());
      } catch (error) {
        console.error("Failed to load dashboard data", error);
        if (!silent) triggerBanner("Could not load dashboard data.", "warn");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [triggerBanner],
  );

  useEffect(() => {
    loadAll(true);
  }, [loadAll]);

  // Poll for new calls/bookings so the dashboard stays current.
  useEffect(() => {
    const interval = window.setInterval(() => loadAll(true), 10000);
    return () => window.clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatting]);

  // ── Derived metrics from real data ────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalCalls = calls.length;
    const booked = calls.filter((call) => call.outcome === "booked").length;
    const answered = calls.filter((call) => call.outcome !== "missed" && call.outcome !== "abandoned").length;
    const answerRate = totalCalls ? Math.round((answered / totalCalls) * 100) : 0;
    return [
      {
        label: "Calls handled",
        value: totalCalls.toString().padStart(2, "0"),
        helper: `${answerRate}% answered`,
        icon: <Headset className="h-4 w-4" />,
      },
      {
        label: "Bookings",
        value: appointments.length.toString().padStart(2, "0"),
        helper: `${booked} from calls`,
        icon: <CalendarClock className="h-4 w-4" />,
      },
      {
        label: "Knowledge",
        value: knowledgeBase.length.toString().padStart(2, "0"),
        helper: "indexed assets",
        icon: <Database className="h-4 w-4" />,
      },
      {
        label: "Avg handle",
        value: formatDuration(
          totalCalls ? Math.round(calls.reduce((sum, call) => sum + call.durationSec, 0) / totalCalls) : 0,
        ),
        helper: "per call",
        icon: <Activity className="h-4 w-4" />,
      },
    ];
  }, [calls, appointments.length, knowledgeBase.length]);

  const analyticsKPIs = useMemo(() => {
    const total = calls.length;
    const booked = calls.filter((call) => call.outcome === "booked").length;
    const escalated = calls.filter((call) => call.outcome === "escalated").length;
    const withIntent = calls.filter((call) => Boolean(call.intent)).length;
    const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "—");
    return [
      { label: "Booking rate", value: pct(booked), helper: "calls → bookings" },
      { label: "Intent captured", value: pct(withIntent), helper: "qualified calls" },
      { label: "Escalation", value: pct(escalated), helper: "needs human" },
      {
        label: "Knowledge hits",
        value: calls.reduce((sum, call) => sum + call.knowledgeQueries.length, 0).toString(),
        helper: "RAG lookups",
      },
    ];
  }, [calls]);

  const conversionFunnel = useMemo(() => {
    const total = calls.length;
    const answered = calls.filter((call) => call.outcome !== "missed" && call.outcome !== "abandoned").length;
    const qualified = calls.filter((call) => Boolean(call.intent)).length;
    const booked = calls.filter((call) => call.outcome === "booked").length;
    const rate = (n: number) => (total ? n / total : 0);
    return [
      { stage: "Calls answered", count: answered, rate: rate(answered) },
      { stage: "Qualified", count: qualified, rate: rate(qualified) },
      { stage: "Booked", count: booked, rate: rate(booked) },
      { stage: "Confirmed", count: appointments.filter((a) => a.status === "confirmed").length, rate: rate(booked) },
    ];
  }, [calls, appointments]);

  const filteredCalls = useMemo(() => {
    if (callFilter === "all") return calls;
    return calls.filter((call) => call.outcome === callFilter);
  }, [calls, callFilter]);

  const selectedCall = useMemo(
    () => calls.find((call) => call.id === selectedCallId) ?? null,
    [calls, selectedCallId],
  );

  const callBookings = useMemo(() => {
    if (!selectedCall) return [];
    return appointments.filter(
      (apt) => selectedCall.bookingIds.includes(apt.id) || apt.callSid === selectedCall.callSid,
    );
  }, [selectedCall, appointments]);

  // ── Knowledge actions ─────────────────────────────────────────────────────
  const persistKnowledgeItem = async (item: KnowledgeItem) => {
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    const data = await response.json().catch(() => ({}));
    setKnowledgeBase((prev) => [item, ...prev.filter((existing) => existing.id !== item.id)]);
    return data as { indexed?: number; warning?: string };
  };

  const addKnowledgeItem = async () => {
    if (!newDocTitle.trim() || !newDocContent.trim()) {
      triggerBanner("Add a title and content first.", "warn");
      return;
    }
    setIsSavingDoc(true);
    const item: KnowledgeItem = {
      id: crypto.randomUUID(),
      title: newDocTitle.trim(),
      type: newDocType,
      content: newDocContent.trim(),
      dateAdded: new Date(),
    };
    try {
      const result = await persistKnowledgeItem(item);
      setNewDocContent("");
      setNewDocTitle("");
      triggerBanner(
        result.warning ? "Saved, but embeddings failed." : `Saved and indexed (${result.indexed ?? 0} chunks).`,
        result.warning ? "warn" : "success",
      );
    } catch {
      triggerBanner("Failed to save knowledge item.", "warn");
    } finally {
      setIsSavingDoc(false);
    }
  };

  const deleteKnowledgeItem = async (id: string) => {
    setKnowledgeBase((prev) => prev.filter((item) => item.id !== id));
    try {
      await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      triggerBanner("Knowledge item removed.", "success");
    } catch {
      triggerBanner("Failed to remove item.", "warn");
      loadAll(true);
    }
  };

  const sendChatMessage = async () => {
    const message = chatInput.trim();
    if (!message || isChatting) return;

    const userTurn: KnowledgeChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: message,
      at: new Date().toISOString(),
    };
    const history = chatMessages.map((turn) => ({ role: turn.role, text: turn.text }));
    setChatMessages((prev) => [...prev, userTurn]);
    setChatInput("");
    setIsChatting(true);

    try {
      const response = await fetch("/api/knowledge/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await response.json()) as {
        reply?: string;
        draft?: { title: string; type: KnowledgeItem["type"]; content: string } | null;
        error?: string;
      };

      if (data.error) throw new Error(data.error);

      let createdItemId: string | undefined;
      if (data.draft?.content) {
        const item: KnowledgeItem = {
          id: crypto.randomUUID(),
          title: data.draft.title || "Untitled entry",
          type: data.draft.type || "text",
          content: data.draft.content,
          dateAdded: new Date(),
        };
        await persistKnowledgeItem(item);
        createdItemId = item.id;
      }

      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.reply || "Got it.",
          at: new Date().toISOString(),
          createdItemId,
        },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Sorry, I could not process that. Please try again.",
          at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  // ── File upload / AI extraction ───────────────────────────────────────────
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });

  const analyzeFileWithAI = async (file: File) => {
    const base64Data = await fileToBase64(file);
    const response = await fetch("/api/knowledge/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mimeType: file.type || "application/octet-stream",
        data: base64Data,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Could not extract file content.");
    return data as {
      knowledge_content?: string;
      company_profile?: Partial<CompanyProfile>;
    };
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
        : "doc";

    try {
      setIsParsing(true);
      const data = await analyzeFileWithAI(file);
      const content = data.knowledge_content || "";
      if (!content) setParseError("AI could not extract content. Try another file or paste text manually.");

      setParsePreview({
        content,
        title: file.name.replace(/\.[^.]+$/, "") || file.name,
        type: inferredType,
        fileName: file.name,
      });
      if (data.company_profile) setParseProfile(data.company_profile);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setIsParsing(false);
      setIsFileLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveParsedToKnowledge = async () => {
    if (!parsePreview?.content.trim()) return;
    const item: KnowledgeItem = {
      id: crypto.randomUUID(),
      title: parsePreview.title || "Uploaded Resource",
      type: parsePreview.type,
      content: parsePreview.content,
      dateAdded: new Date(),
      fileName: parsePreview.fileName,
    };
    try {
      const result = await persistKnowledgeItem(item);
      setParsePreview(null);
      setParseProfile(null);
      triggerBanner(`Uploaded resource saved (${result.indexed ?? 0} chunks indexed).`, "success");
    } catch {
      triggerBanner("Failed to save uploaded resource.", "warn");
    }
  };

  const applyParsedProfile = () => {
    if (!parseProfile) return;
    updateProfileField({
      name: parseProfile.name || profile.name,
      industry: parseProfile.industry || profile.industry,
      description: parseProfile.description || profile.description,
      address: parseProfile.address || profile.address,
      contactPhone: parseProfile.contactPhone || profile.contactPhone,
      contactEmail: parseProfile.contactEmail || profile.contactEmail,
    });
    triggerBanner("Profile fields applied. Remember to save.", "info");
  };

  const saveProfile = async () => {
    try {
      await fetch("/api/company-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      profileDirtyRef.current = false;
      triggerBanner("Company profile saved.", "success");
    } catch {
      triggerBanner("Failed to save profile.", "warn");
    }
  };

  const updateProfileField = (patch: Partial<CompanyProfile>) => {
    profileDirtyRef.current = true;
    setProfile((prev) => ({ ...prev, ...patch }));
  };

  const updateAppointmentStatus = async (id: string, status: Appointment["status"]) => {
    setAppointments((prev) => prev.map((apt) => (apt.id === id ? { ...apt, status } : apt)));
    try {
      await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      triggerBanner("Failed to update booking.", "warn");
      loadAll(true);
    }
  };

  const handleBookedFromCall = async (apt: Appointment) => {
    setAppointments((prev) => [apt, ...prev]);
    try {
      await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apt),
      });
    } catch {
      console.error("Failed to persist booking");
    }
    triggerBanner("Appointment booked from live call", "success");
  };

  const navItems: { key: TabKey; label: string; icon: typeof Rocket }[] = [
    { key: "overview", label: "Command overview", icon: Rocket },
    { key: "calls", label: "Calls & reports", icon: PhoneCall },
    { key: "knowledge", label: "Knowledge ops", icon: Database },
    { key: "voice", label: "Voice console", icon: Headset },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 pb-6 pt-8 lg:pt-10">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-lg font-bold text-white shadow-md transition hover:brightness-105"
            title="Back to site"
          >
            KA
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-emerald-700">Reception OS</p>
            <h1 className="text-2xl font-bold text-slate-900">
              {profile.name ? `${profile.name} Desk` : "KeralAI Enterprise Desk"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:block">
            {lastSynced
              ? `Synced ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Syncing…"}
          </span>
          <Button variant="ghost" className="gap-2 text-slate-600" asChild>
            <Link href="/dashboard/settings">
              <Settings2 className="h-4 w-4" /> Settings
            </Link>
          </Button>
          <Button variant="ghost" className="gap-2 text-slate-600" asChild>
            <Link href="/dashboard/performance">
              <Gauge className="h-4 w-4" /> Performance
            </Link>
          </Button>
          <Button variant="ghost" className="gap-2 text-slate-600" onClick={() => loadAll()} disabled={isRefreshing}>
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} /> Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={() => {
              setVoiceAutoConnect(true);
              setShowVoiceConsole(true);
            }}
          >
            <PhoneCall className="h-4 w-4" /> Start concierge
          </Button>
        </div>
      </header>

      {banner && (
        <div
          className={cn(
            "mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-2xl border px-4 py-3 text-sm shadow-sm",
            banner.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            banner.tone === "info" && "border-slate-200 bg-white text-slate-800",
            banner.tone === "warn" && "border-amber-200 bg-amber-50 text-amber-800",
          )}
        >
          <span>{banner.message}</span>
          <button className="text-xs font-semibold text-slate-500 hover:text-slate-800" onClick={() => setBanner(null)}>
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
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition-all",
                  activeTab === item.key
                    ? "bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-700 ring-1 ring-emerald-200"
                    : "text-slate-600 hover:bg-slate-100",
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
              Live agent, call reports, and appointment sync in one console.
            </p>
            <div className="mt-4 flex items-center gap-2 text-emerald-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold uppercase">Active</span>
            </div>
          </div>
        </aside>

        <section className="space-y-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="w-full">
            <TabsList className="flex w-full flex-wrap gap-2 lg:hidden">
              {navItems.map((item) => (
                <TabsTrigger key={item.key} value={item.key} className="flex-1">
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── Overview ─────────────────────────────────────────────── */}
            <TabsContent value="overview" className="space-y-6">
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
                    <CardDescription>Derived from real call records.</CardDescription>
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
                      <CardDescription>Call → action → outcome.</CardDescription>
                    </div>
                    <Badge variant="accent">Live</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {conversionFunnel.map((step, idx) => (
                      <div key={step.stage} className="space-y-1">
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                          <span>
                            {idx + 1}. {step.stage}
                          </span>
                          <span>{step.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                            style={{ width: `${Math.min(step.rate * 100, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-500">{Math.round(step.rate * 100)}% of calls</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader className="flex items-start justify-between">
                    <div>
                      <CardTitle>Recent calls</CardTitle>
                      <CardDescription>Latest receptionist outcomes.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setActiveTab("calls")}>
                      View all
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[240px] pr-4">
                      <div className="space-y-3">
                        {calls.slice(0, 6).map((call) => (
                          <button
                            key={call.id}
                            onClick={() => {
                              setSelectedCallId(call.id);
                              setActiveTab("calls");
                            }}
                            className="w-full rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200"
                          >
                            <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                              <span>{call.caller}</span>
                              <span className="text-xs text-slate-500">{formatWhen(call.startedAt)}</span>
                            </div>
                            <p className="text-sm text-slate-600">{call.intent || "General enquiry"}</p>
                            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 font-semibold capitalize",
                                  OUTCOME_STYLES[call.outcome],
                                )}
                              >
                                {call.outcome}
                              </span>
                              <span>{formatDuration(call.durationSec)}</span>
                            </div>
                          </button>
                        ))}
                        {calls.length === 0 && (
                          <p className="py-8 text-center text-sm text-slate-500">
                            No calls yet. Start the concierge or place a phone call.
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-xl">Appointments & routing</CardTitle>
                    <CardDescription>Bookings captured by Maya, including phone calls.</CardDescription>
                  </div>
                  <Badge variant="secondary">{appointments.length} total</Badge>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.15em] text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Guest</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Reason</th>
                          <th className="px-4 py-3">Source</th>
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
                            <td className="px-4 py-3 text-slate-500">{apt.callSid ? "Phone call" : "Dashboard"}</td>
                            <td className="px-4 py-3">
                              <Select
                                value={apt.status}
                                onValueChange={(v) => updateAppointmentStatus(apt.id, v as Appointment["status"])}
                              >
                                <SelectTrigger className="h-8 w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        ))}
                        {appointments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                              No bookings yet. They appear here automatically after a call.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="shadow-card">
                  <CardHeader className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Plug className="h-4 w-4" /> CRM integration
                      </CardTitle>
                      <CardDescription>
                        Contacts and bookings are mirrored to your CRM on every call.
                      </CardDescription>
                    </div>
                    <Badge
                      variant={crmStatus?.configured ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {crmStatus?.provider ?? "none"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
                      <p className="font-semibold text-slate-900">
                        {crmStatus?.configured ? "Connected" : "Not configured"}
                      </p>
                      <p className="mt-1 text-slate-600">
                        {crmStatus?.configured
                          ? `Sync target: ${crmStatus.description}.`
                          : "Set CRM_PROVIDER=webhook and CRM_WEBHOOK_URL to push contacts, calls, and bookings to your CRM."}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Contacts</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-900">{contacts.length}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Booking window</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {bookingSettings
                            ? `${bookingSettings.openTime}–${bookingSettings.closeTime}, ${bookingSettings.slotMinutes}m slots`
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-4 w-4" /> Contacts
                      </CardTitle>
                      <CardDescription>Everyone the agent has spoken with.</CardDescription>
                    </div>
                    <Badge variant="secondary">{contacts.length}</Badge>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[240px] pr-4">
                      <div className="space-y-2">
                        {contacts.map((contact) => (
                          <div
                            key={contact.id}
                            className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {contact.name || "Unknown caller"}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {contact.phone || contact.email || "No contact details"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {contact.crmId && (
                                <Badge variant="accent" className="capitalize">
                                  {contact.crmProvider}
                                </Badge>
                              )}
                              <span className="whitespace-nowrap text-xs text-slate-400">
                                {contact.lastContactAt ? formatWhen(contact.lastContactAt) : "—"}
                              </span>
                            </div>
                          </div>
                        ))}
                        {contacts.length === 0 && (
                          <p className="py-10 text-center text-sm text-slate-500">
                            No contacts yet. They are created automatically on the first call.
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Calls & reports ──────────────────────────────────────── */}
            <TabsContent value="calls" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
                <Card className="shadow-card">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Call log</CardTitle>
                      <CardDescription>{filteredCalls.length} records</CardDescription>
                    </div>
                    <Select value={callFilter} onValueChange={(v) => setCallFilter(v as typeof callFilter)}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All outcomes</SelectItem>
                        <SelectItem value="booked">Booked</SelectItem>
                        <SelectItem value="answered">Answered</SelectItem>
                        <SelectItem value="escalated">Escalated</SelectItem>
                        <SelectItem value="missed">Missed</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[520px] pr-4">
                      <div className="space-y-3">
                        {filteredCalls.map((call) => (
                          <button
                            key={call.id}
                            onClick={() => setSelectedCallId(call.id)}
                            className={cn(
                              "w-full rounded-2xl border p-4 text-left transition",
                              selectedCallId === call.id
                                ? "border-emerald-300 bg-emerald-50/50 shadow-sm"
                                : "border-slate-100 bg-white hover:border-emerald-200",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 font-semibold text-slate-900">
                                <User className="h-4 w-4 text-slate-400" />
                                {call.caller}
                              </div>
                              <span className="text-xs text-slate-500">{formatWhen(call.startedAt)}</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">{call.intent || "General enquiry"}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 font-semibold capitalize",
                                  OUTCOME_STYLES[call.outcome],
                                )}
                              >
                                {call.outcome}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {formatDuration(call.durationSec)}
                              </span>
                              <span className="capitalize">{call.channel}</span>
                              {call.bookingIds.length > 0 && (
                                <span className="flex items-center gap-1 text-emerald-700">
                                  <CalendarClock className="h-3 w-3" /> {call.bookingIds.length} booking
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                        {filteredCalls.length === 0 && (
                          <p className="py-10 text-center text-sm text-slate-500">No calls match this filter.</p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle>Call report</CardTitle>
                    <CardDescription>
                      {selectedCall ? `Call ${selectedCall.callSid}` : "Select a call to see the full report."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!selectedCall ? (
                      <div className="flex h-[520px] flex-col items-center justify-center text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                          <PhoneCall className="h-7 w-7 text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-500">
                          Pick a call from the log to view the transcript, actions, and bookings.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {[
                            { label: "Outcome", value: selectedCall.outcome },
                            { label: "Duration", value: formatDuration(selectedCall.durationSec) },
                            { label: "Channel", value: selectedCall.channel },
                            { label: "Turns", value: selectedCall.transcript.length.toString() },
                          ].map((stat) => (
                            <div key={stat.label} className="rounded-2xl border border-slate-100 p-3">
                              <p className="text-xs uppercase tracking-[0.15em] text-slate-500">{stat.label}</p>
                              <p className="mt-1 text-sm font-semibold capitalize text-slate-900">{stat.value}</p>
                            </div>
                          ))}
                        </div>

                        {selectedCall.summary && (
                          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Summary</p>
                            <p className="mt-1 text-sm text-slate-700">{selectedCall.summary}</p>
                          </div>
                        )}

                        {callBookings.length > 0 && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-emerald-700">
                              <CalendarClock className="h-4 w-4" /> Bookings from this call
                            </p>
                            <div className="mt-2 space-y-2">
                              {callBookings.map((apt) => (
                                <div key={apt.id} className="flex items-center justify-between text-sm text-emerald-900">
                                  <span className="font-semibold">{apt.customerName}</span>
                                  <span>
                                    {apt.date} · {apt.time}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedCall.knowledgeQueries.length > 0 && (
                          <div className="rounded-2xl border border-slate-100 p-4">
                            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                              <Brain className="h-4 w-4" /> Knowledge lookups
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {selectedCall.knowledgeQueries.map((query, idx) => (
                                <Badge key={idx} variant="secondary">
                                  {query}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Transcript</p>
                          <ScrollArea className="h-[260px] rounded-2xl border border-slate-100 p-4">
                            <div className="space-y-3">
                              {selectedCall.transcript.map((turn, idx) => (
                                <div
                                  key={idx}
                                  className={cn(
                                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                                    turn.role === "caller"
                                      ? "bg-slate-100 text-slate-800"
                                      : "ml-auto bg-emerald-100 text-emerald-900",
                                  )}
                                >
                                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                                    {turn.role === "caller" ? "Caller" : "Maya"}
                                  </p>
                                  {turn.text}
                                </div>
                              ))}
                              {selectedCall.transcript.length === 0 && (
                                <p className="py-6 text-center text-sm text-slate-500">
                                  No transcript captured for this call.
                                </p>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Knowledge ops ────────────────────────────────────────── */}
            <TabsContent value="knowledge" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquarePlus className="h-5 w-5 text-emerald-600" /> Add knowledge by chat
                    </CardTitle>
                    <CardDescription>
                      Describe business info in plain language. Maya&apos;s curator drafts and indexes it.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ScrollArea className="h-[320px] rounded-2xl border border-slate-100 p-4">
                      <div className="space-y-3">
                        {chatMessages.length === 0 && (
                          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                            Try: &ldquo;We&apos;re open Mon–Sat 9am to 7pm, closed Sundays.&rdquo; or
                            &ldquo;Our web app projects start at ₹75,000.&rdquo;
                          </div>
                        )}
                        {chatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                              msg.role === "user"
                                ? "ml-auto bg-emerald-600 text-white"
                                : "bg-slate-100 text-slate-800",
                            )}
                          >
                            {msg.text}
                            {msg.createdItemId && (
                              <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" /> Added to knowledge base
                              </p>
                            )}
                          </div>
                        ))}
                        {isChatting && (
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Curating…
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Input
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendChatMessage();
                          }
                        }}
                        placeholder="Tell Maya about your business…"
                      />
                      <Button onClick={sendChatMessage} disabled={isChatting || !chatInput.trim()}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Plus className="h-5 w-5 text-emerald-600" /> Add manually or upload
                    </CardTitle>
                    <CardDescription>Paste text or let AI extract from a file.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Input
                        placeholder="Document title"
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        className="flex-1"
                      />
                      <Select value={newDocType} onValueChange={(v) => setNewDocType(v as KnowledgeItem["type"])}>
                        <SelectTrigger className="sm:w-36">
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
                    </div>
                    <Textarea
                      rows={4}
                      placeholder="Paste procedures, pricing, hours, or policies."
                      value={newDocContent}
                      onChange={(e) => setNewDocContent(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={addKnowledgeItem} disabled={isSavingDoc}>
                        {isSavingDoc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Save & index
                      </Button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf,.doc,.docx,.txt,.csv,image/*"
                        onChange={(e) => handleFileSelect(e.target.files?.[0])}
                      />
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isFileLoading || isParsing}
                      >
                        <UploadCloud className="h-4 w-4" />
                        {isParsing ? "Parsing…" : "Upload file"}
                      </Button>
                    </div>

                    {parseError && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <AlertTriangle className="h-4 w-4" /> {parseError}
                      </div>
                    )}

                    {parsePreview && (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">AI parsed draft</p>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setParsePreview(null);
                                setParseProfile(null);
                                setParseError(null);
                              }}
                            >
                              Discard
                            </Button>
                            <Button size="sm" onClick={saveParsedToKnowledge}>
                              Save to knowledge base
                            </Button>
                          </div>
                        </div>
                        <Input
                          value={parsePreview.title}
                          onChange={(e) => setParsePreview({ ...parsePreview, title: e.target.value })}
                        />
                        <Textarea
                          rows={5}
                          value={parsePreview.content}
                          onChange={(e) => setParsePreview({ ...parsePreview, content: e.target.value })}
                        />
                        {parseProfile && (
                          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">
                                Suggested company profile
                              </p>
                              <Button size="sm" variant="secondary" onClick={applyParsedProfile}>
                                Apply
                              </Button>
                            </div>
                            <p className="text-sm text-emerald-900">
                              {parseProfile.name || "—"} · {parseProfile.industry || "—"}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card className="shadow-card">
                <CardHeader className="flex items-center justify-between">
                  <div>
                    <CardTitle>Knowledge assets</CardTitle>
                    <CardDescription>{knowledgeBase.length} indexed entries</CardDescription>
                  </div>
                  <Badge variant="secondary">
                    <Database className="mr-1 h-3 w-3" /> RAG ready
                  </Badge>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[360px] rounded-2xl border border-slate-100">
                    <div className="divide-y divide-slate-100">
                      {knowledgeBase.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                          <Badge variant="secondary" className="capitalize">
                            {item.type}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="line-clamp-2 text-sm text-slate-600">{item.content}</p>
                            {item.fileName && <p className="mt-0.5 text-xs text-slate-400">File: {item.fileName}</p>}
                          </div>
                          <span className="whitespace-nowrap text-xs text-slate-400">
                            {toDate(item.dateAdded).toLocaleDateString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-400 hover:text-red-600"
                            onClick={() => deleteKnowledgeItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {knowledgeBase.length === 0 && (
                        <p className="py-12 text-center text-sm text-slate-500">
                          No knowledge yet. Add via chat, paste, or upload.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Voice console ────────────────────────────────────────── */}
            <TabsContent value="voice" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle>Voice persona</CardTitle>
                    <CardDescription>How Maya sounds on calls.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Voice</p>
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
                      </div>
                    </div>
                    <Button
                      className="w-full gap-2"
                      onClick={() => {
                        setVoiceAutoConnect(true);
                        setShowVoiceConsole(true);
                      }}
                    >
                      <PhoneCall className="h-4 w-4" /> Start live session
                    </Button>
                  </CardContent>
                </Card>

                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" /> Company profile
                    </CardTitle>
                    <CardDescription>What Maya knows about your business.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        value={profile.name}
                        onChange={(e) => updateProfileField({ name: e.target.value })}
                        placeholder="Brand name"
                      />
                      <Input
                        value={profile.industry}
                        onChange={(e) => updateProfileField({ industry: e.target.value })}
                        placeholder="Industry"
                      />
                      <Input
                        value={profile.contactEmail}
                        onChange={(e) => updateProfileField({ contactEmail: e.target.value })}
                        placeholder="Email"
                      />
                      <Input
                        value={profile.contactPhone}
                        onChange={(e) => updateProfileField({ contactPhone: e.target.value })}
                        placeholder="Phone"
                      />
                    </div>
                    <Input
                      value={profile.address}
                      onChange={(e) => updateProfileField({ address: e.target.value })}
                      placeholder="Address"
                    />
                    <Textarea
                      rows={3}
                      value={profile.description}
                      onChange={(e) => updateProfileField({ description: e.target.value })}
                      placeholder="Brand story and service promise."
                    />
                    <Button onClick={saveProfile} className="w-full sm:w-auto">
                      Save profile
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-gradient-to-b from-slate-900 to-slate-950 text-white">
                <CardHeader>
                  <CardDescription className="text-emerald-200">AI concierge health</CardDescription>
                  <CardTitle className="text-2xl text-white">24/7 reliability layer</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-sm text-emerald-100">Calls handled</p>
                    <p className="mt-1 text-2xl font-semibold">{calls.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-sm text-emerald-100">Bookings captured</p>
                    <p className="mt-1 text-2xl font-semibold">{appointments.length}</p>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-sm text-emerald-100">Knowledge assets</p>
                    <p className="mt-1 text-2xl font-semibold">{knowledgeBase.length}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
            </div>
          )}
        </section>
      </main>

      {showVoiceConsole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur">
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <Button
              variant="secondary"
              className="bg-white"
              onClick={() => {
                setShowVoiceConsole(false);
                setVoiceAutoConnect(false);
                loadAll(true);
              }}
            >
              Close console
            </Button>
          </div>
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl shadow-2xl">
            <LiveReceptionist
              companyProfile={profile}
              onBookAppointment={handleBookedFromCall}
              autoConnect={voiceAutoConnect}
              onAutoConnectHandled={() => setVoiceAutoConnect(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}