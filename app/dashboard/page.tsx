"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Inbox, Loader2, PhoneCall, RefreshCw, Settings2, X } from "lucide-react";

import CallsSection from "@/components/dashboard/CallsSection";
import DashboardSidebar, { NAV_ITEMS, type DashboardTab } from "@/components/dashboard/DashboardSidebar";
import InstructionsSection from "@/components/dashboard/InstructionsSection";
import KnowledgeSection from "@/components/dashboard/KnowledgeSection";
import OverviewSection from "@/components/dashboard/OverviewSection";
import VoiceSection from "@/components/dashboard/VoiceSection";
import { toDate } from "@/components/dashboard/shared";
import LiveReceptionist from "@/components/LiveReceptionist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Appointment,
  BookingSettings,
  CallRecord,
  CallbackRequest,
  CompanyProfile,
  Contact,
  CrmStatus,
  KnowledgeChatMessage,
  KnowledgeItem,
  MessageRow,
} from "@/types";

const EMPTY_PROFILE: CompanyProfile = {
  name: "",
  industry: "",
  description: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
};

const TAB_HEADINGS: Record<DashboardTab, { title: string; description: string }> = {
  overview: {
    title: "Your AI assistant",
    description: "Handles calls, keeps conversations natural, and passes important information back to you.",
  },
  calls: {
    title: "Calls",
    description: "Every conversation with a transcript, summary, and the actions your assistant took.",
  },
  knowledge: {
    title: "Knowledge",
    description: "Reference information your assistant can use, and the instructions that apply to new calls.",
  },
  instructions: {
    title: "Active instructions",
    description: "Temporary behavior that applies to new calls until you turn it off.",
  },
  voice: {
    title: "Voice",
    description: "How your assistant sounds, and how to test it with a live session.",
  },
};

export default function DashboardPage() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [crmStatus, setCrmStatus] = useState<CrmStatus | null>(null);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [callFilter, setCallFilter] = useState<"all" | CallRecord["outcome"]>("all");

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
        const [profileRes, knowledgeRes, appointmentsRes, callsRes, metricsRes, contactsRes, inboxRes] =
          await Promise.all([
            fetch("/api/company-profile").then((r) => r.json()),
            fetch("/api/knowledge").then((r) => r.json()),
            fetch("/api/appointments").then((r) => r.json()),
            fetch("/api/calls").then((r) => r.json()),
            fetch("/api/metrics").then((r) => r.json()),
            fetch("/api/contacts").then((r) => r.json()),
            fetch("/api/inbox").then((r) => r.json()),
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
        if (inboxRes && !inboxRes.error) {
          setCallbacks(Array.isArray(inboxRes.callbacks) ? inboxRes.callbacks : []);
          setMessages(Array.isArray(inboxRes.messages) ? inboxRes.messages : []);
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

  // Poll for new calls/messages so the dashboard stays current.
  useEffect(() => {
    const interval = window.setInterval(() => loadAll(true), 10000);
    return () => window.clearInterval(interval);
  }, [loadAll]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatting]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const knowledgeItems = useMemo(
    () => knowledgeBase.filter((item) => item.type !== "instruction"),
    [knowledgeBase],
  );
  const instructionItems = useMemo(
    () => knowledgeBase.filter((item) => item.type === "instruction"),
    [knowledgeBase],
  );

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

  const openCall = useCallback((id: string) => {
    setSelectedCallId(id);
    setActiveTab("calls");
  }, []);

  // ── Knowledge actions ─────────────────────────────────────────────────────
  const persistKnowledgeItem = async (item: KnowledgeItem) => {
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || "Failed to save knowledge item");
    }

    const savedItem = (data?.item as KnowledgeItem | undefined) ?? item;
    const normalized: KnowledgeItem = { ...savedItem, dateAdded: toDate(savedItem.dateAdded) };

    setKnowledgeBase((prev) => [
      normalized,
      ...prev.filter((existing) => existing.id !== normalized.id),
    ]);

    return data as {
      indexed?: number;
      warning?: string;
      item?: KnowledgeItem;
      activeInstruction?: boolean;
    };
  };

  const addKnowledgeItem = async () => {
    if (!newDocTitle.trim() || !newDocContent.trim()) {
      triggerBanner("Add a title and content first.", "warn");
      return;
    }
    setIsSavingDoc(true);
    const isInstruction = newDocType === "instruction";
    const item: KnowledgeItem = {
      id: crypto.randomUUID(),
      title: newDocTitle.trim(),
      type: newDocType,
      content: newDocContent.trim(),
      dateAdded: new Date(),
      isActive: isInstruction,
    };
    try {
      const result = await persistKnowledgeItem(item);
      setNewDocContent("");
      setNewDocTitle("");
      if (isInstruction) {
        triggerBanner("Instruction saved and active.", "success");
      } else {
        triggerBanner(
          result.warning
            ? "Saved, but it may take a moment to become searchable."
            : "Knowledge saved.",
          result.warning ? "warn" : "success",
        );
      }
    } catch {
      triggerBanner("Failed to save. Please try again.", "warn");
    } finally {
      setIsSavingDoc(false);
    }
  };

  const addInstruction = async (title: string, content: string): Promise<boolean> => {
    const item: KnowledgeItem = {
      id: crypto.randomUUID(),
      title,
      type: "instruction",
      content,
      dateAdded: new Date(),
      isActive: true,
    };
    try {
      await persistKnowledgeItem(item);
      triggerBanner("Instruction saved and active.", "success");
      return true;
    } catch {
      triggerBanner("Failed to save instruction.", "warn");
      return false;
    }
  };

  const toggleInstructionActive = async (item: KnowledgeItem) => {
    const updated: KnowledgeItem = { ...item, isActive: !item.isActive };
    try {
      await persistKnowledgeItem(updated);
      triggerBanner(updated.isActive ? "Instruction activated." : "Instruction turned off.", "success");
    } catch {
      triggerBanner("Failed to update instruction.", "warn");
    }
  };

  const deleteKnowledgeItem = async (id: string) => {
    setKnowledgeBase((prev) => prev.filter((item) => item.id !== id));
    try {
      await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      triggerBanner("Removed.", "success");
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
        shouldSave?: boolean;
        draft?: {
          title: string;
          type: KnowledgeItem["type"];
          content: string;
          isActive: boolean;
        } | null;
        error?: string;
      };

      if (data.error) throw new Error(data.error);

      let createdItemId: string | undefined;
      if (data.shouldSave === true && data.draft?.content?.trim()) {
        const item: KnowledgeItem = {
          id: crypto.randomUUID(),
          title: data.draft.title || "Untitled entry",
          type: data.draft.type || "text",
          content: data.draft.content,
          dateAdded: new Date(),
          isActive: data.draft.type === "instruction" ? data.draft.isActive !== false : true,
        };
        const saved = await persistKnowledgeItem(item);
        createdItemId = saved.item?.id ?? item.id;
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
      if (!content) setParseError("The file could not be read. Try another file or paste the text manually.");

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
      title: parsePreview.title || "Uploaded resource",
      type: parsePreview.type,
      content: parsePreview.content,
      dateAdded: new Date(),
      fileName: parsePreview.fileName,
    };
    try {
      await persistKnowledgeItem(item);
      setParsePreview(null);
      setParseProfile(null);
      triggerBanner("File added to knowledge.", "success");
    } catch {
      triggerBanner("Failed to save the file.", "warn");
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
    triggerBanner("Details applied. Remember to save.", "info");
  };

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await fetch("/api/company-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      profileDirtyRef.current = false;
      triggerBanner("Changes saved.", "success");
    } catch {
      triggerBanner("Failed to save changes.", "warn");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const updateProfileField = (patch: Partial<CompanyProfile>) => {
    profileDirtyRef.current = true;
    setProfile((prev) => ({ ...prev, ...patch }));
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
    triggerBanner("Booking captured from the live session.", "success");
  };

  const startVoiceSession = (autoConnect = false) => {
    setVoiceAutoConnect(autoConnect);
    setShowVoiceConsole(true);
  };

  const configured = Boolean(profile.name?.trim());
  const heading = TAB_HEADINGS[activeTab];

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 lg:hidden"
              title="Back to site"
              aria-label="Back to site"
            >
              KA
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">{heading.title}</h1>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                    configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
                  )}
                >
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", configured ? "bg-emerald-500" : "bg-amber-500")}
                    aria-hidden
                  />
                  {configured ? "Assistant configured" : "Setup needed"}
                </span>
              </div>
              <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{heading.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden text-xs text-slate-500 sm:block">
              {lastSynced
                ? `Synced ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Syncing…"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-slate-600"
              onClick={() => loadAll()}
              disabled={isRefreshing}
              aria-label="Refresh data"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => startVoiceSession(true)}>
              <PhoneCall className="h-4 w-4" />
              <span className="hidden sm:inline">Start live session</span>
              <span className="sm:hidden">Live session</span>
            </Button>
          </div>
        </div>

        {/* Mobile navigation */}
        <nav
          className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden"
          aria-label="Assistant sections"
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              aria-current={activeTab === item.key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
                activeTab === item.key
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
          <Link
            href="/dashboard/crm"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
          >
            <Inbox className="h-4 w-4" />
            Inbox
          </Link>
          <Link
            href="/dashboard/settings"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
          >
            <Settings2 className="h-4 w-4" />
            Settings
          </Link>
        </nav>
      </header>

      {banner && (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
          <div
            role="status"
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm",
              banner.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
              banner.tone === "info" && "border-slate-200 bg-white text-slate-700",
              banner.tone === "warn" && "border-amber-200 bg-amber-50 text-amber-800",
            )}
          >
            <span className="flex items-center gap-2">
              {banner.tone === "success" && <Check className="h-4 w-4" />}
              {banner.message}
            </span>
            <button
              type="button"
              className="text-xs font-medium opacity-70 transition-opacity hover:opacity-100"
              onClick={() => setBanner(null)}
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto grid max-w-7xl gap-6 px-4 pb-14 pt-6 sm:px-6 lg:grid-cols-[240px_1fr]">
        <DashboardSidebar
          activeTab={activeTab}
          onSelect={setActiveTab}
          ownerName={profile.name}
          configured={configured}
        />

        <section className="min-w-0">
          {activeTab === "overview" && (
            <OverviewSection
              calls={calls}
              callbacks={callbacks}
              messages={messages}
              knowledge={knowledgeItems}
              instructions={instructionItems}
              appointments={appointments}
              loading={isLoading}
              onOpenCall={openCall}
              onGoTo={setActiveTab}
              onToggleInstruction={toggleInstructionActive}
            />
          )}

          {activeTab === "calls" && (
            <CallsSection
              filteredCalls={filteredCalls}
              callFilter={callFilter}
              onFilterChange={setCallFilter}
              selectedCall={selectedCall}
              callBookings={callBookings}
              loading={isLoading}
              onSelectCall={setSelectedCallId}
            />
          )}

          {activeTab === "knowledge" && (
            <KnowledgeSection
              knowledge={knowledgeItems}
              instructions={instructionItems}
              loading={isLoading}
              chatMessages={chatMessages}
              chatInput={chatInput}
              isChatting={isChatting}
              onChatInputChange={setChatInput}
              onSendChat={sendChatMessage}
              chatEndRef={chatEndRef}
              newDocTitle={newDocTitle}
              newDocType={newDocType}
              newDocContent={newDocContent}
              isSavingDoc={isSavingDoc}
              onNewDocTitleChange={setNewDocTitle}
              onNewDocTypeChange={setNewDocType}
              onNewDocContentChange={setNewDocContent}
              onAddKnowledge={addKnowledgeItem}
              isParsing={isParsing}
              isFileLoading={isFileLoading}
              parseError={parseError}
              parsePreview={parsePreview}
              parseProfile={parseProfile}
              onFileSelect={handleFileSelect}
              onSaveParsed={saveParsedToKnowledge}
              onDiscardParsed={() => {
                setParsePreview(null);
                setParseProfile(null);
                setParseError(null);
              }}
              onApplyParsedProfile={applyParsedProfile}
              onPreviewChange={setParsePreview}
              fileInputRef={fileInputRef}
              onDelete={deleteKnowledgeItem}
              onGoToInstructions={() => setActiveTab("instructions")}
            />
          )}

          {activeTab === "instructions" && (
            <InstructionsSection
              instructions={instructionItems}
              loading={isLoading}
              onToggle={toggleInstructionActive}
              onDelete={deleteKnowledgeItem}
              onAdd={addInstruction}
            />
          )}

          {activeTab === "voice" && (
            <VoiceSection
              profile={profile}
              isSaving={isSavingProfile}
              onPatch={updateProfileField}
              onSave={saveProfile}
              onStartSession={() => startVoiceSession(true)}
            />
          )}

          {isLoading && activeTab !== "overview" && activeTab !== "calls" && activeTab !== "knowledge" && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {activeTab === "overview" && (
            <p className="mt-6 text-center text-xs text-slate-500">
              {contacts.length} contact{contacts.length === 1 ? "" : "s"} ·{" "}
              {crmStatus?.configured ? `CRM connected (${crmStatus.provider})` : "No CRM connected"}
              {bookingSettings
                ? ` · Booking window ${bookingSettings.openTime}–${bookingSettings.closeTime}`
                : ""}
            </p>
          )}
        </section>
      </main>

      {showVoiceConsole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 backdrop-blur-sm sm:p-4">
          <div className="absolute right-3 top-3 z-10">
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 bg-white"
              onClick={() => {
                setShowVoiceConsole(false);
                setVoiceAutoConnect(false);
                loadAll(true);
              }}
            >
              <X className="h-4 w-4" /> Close
            </Button>
          </div>
          <div className="h-[92dvh] max-h-[820px] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <LiveReceptionist
              companyProfile={profile}
              onBookAppointment={handleBookedFromCall}
              autoConnect={voiceAutoConnect}
              onAutoConnectHandled={() => setVoiceAutoConnect(false)}
              initialVoiceName={profile.voiceName}
              initialPitch={profile.voicePitch}
              initialSpeed={profile.voiceSpeed}
            />
          </div>
        </div>
      )}
    </div>
  );
}
