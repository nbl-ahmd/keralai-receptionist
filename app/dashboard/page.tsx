"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PhoneCall } from "lucide-react";

import AppShell from "@/components/app/AppShell";
import { AttentionBanner } from "@/components/app/attention";
import AssistantModeCard from "@/components/dashboard/AssistantModeCard";
import CallsSection from "@/components/dashboard/CallsSection";
import InstructionsSection from "@/components/dashboard/InstructionsSection";
import KnowledgeSection from "@/components/dashboard/KnowledgeSection";
import OverviewSection from "@/components/dashboard/OverviewSection";
import VoiceConsole from "@/components/dashboard/VoiceConsole";
import VoiceSection from "@/components/dashboard/VoiceSection";
import { toDate } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { DashboardTab } from "@/components/app/navigation";
import { useAssistantMode } from "@/lib/use-assistant-mode";
import { signOut } from "@/lib/auth/client";
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
    title: "Overview",
    description: "Your assistant's status and the latest activity from your calls.",
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
    description: "Temporary behaviour that applies to new calls until you turn it off.",
  },
  voice: {
    title: "Voice",
    description: "How your assistant sounds, and how to test it with a live session.",
  },
};

export default function DashboardPage() {
  const { toast } = useToast();

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

  // Tabs are deep-linkable via the URL hash so the shared mobile nav works from
  // any dashboard page (e.g. /dashboard#calls).
  const selectTab = useCallback((tab: DashboardTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${tab}`);
    }
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const key = window.location.hash.replace(/^#/, "") as DashboardTab;
      if (NAV_KEYS.includes(key)) setActiveTab(key);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

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

  // Avoid clobbering in-progress profile edits during background polling.
  const profileDirtyRef = useRef(false);

  // Tenant-scoped assistant runtime mode (available, meeting, driving, …).
  const assistantMode = useAssistantMode(30000);
  const modeActive = Boolean(assistantMode.status && assistantMode.status.mode !== "available");

  const router = useRouter();
  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Even if the request fails, send the user to the login screen.
    }
    router.replace("/login");
    router.refresh();
  }, [router]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadAll = useCallback(
    async (silent = false) => {
      if (!silent) setIsRefreshing(true);
      try {
        const [profileRes, knowledgeRes, appointmentsRes, callsRes, metricsRes, contactsRes, inboxRes] =
          await Promise.all([
            fetch("/api/company-profile", { cache: "no-store" }).then((r) => r.json()),
            fetch("/api/knowledge", { cache: "no-store" }).then((r) => r.json()),
            fetch("/api/appointments", { cache: "no-store" }).then((r) => r.json()),
            fetch("/api/calls", { cache: "no-store" }).then((r) => r.json()),
            fetch("/api/metrics", { cache: "no-store" }).then((r) => r.json()),
            fetch("/api/contacts", { cache: "no-store" }).then((r) => r.json()),
            fetch("/api/inbox", { cache: "no-store" }).then((r) => r.json()),
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
        if (!silent) toast({ message: "Could not load dashboard data.", tone: "error" });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [toast],
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

  const openCall = useCallback(
    (id: string) => {
      setSelectedCallId(id);
      selectTab("calls");
    },
    [selectTab],
  );

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
      toast({ message: "Add a title and content first.", tone: "warning" });
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
        toast({ message: "Instruction saved and active.", tone: "success" });
      } else {
        toast({
          message: result.warning ? "Saved — it may take a moment to become searchable." : "Knowledge saved.",
          tone: result.warning ? "warning" : "success",
        });
      }
    } catch {
      toast({ message: "Failed to save. Please try again.", tone: "error" });
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
      toast({ message: "Instruction saved and active.", tone: "success" });
      return true;
    } catch {
      toast({ message: "Failed to save instruction.", tone: "error" });
      return false;
    }
  };

  const toggleInstructionActive = async (item: KnowledgeItem) => {
    const updated: KnowledgeItem = { ...item, isActive: !item.isActive };
    try {
      await persistKnowledgeItem(updated);
      toast({
        message: updated.isActive ? "Instruction activated." : "Instruction turned off.",
        tone: "success",
      });
    } catch {
      toast({ message: "Failed to update instruction.", tone: "error" });
    }
  };

  const deleteKnowledgeItem = async (id: string) => {
    setKnowledgeBase((prev) => prev.filter((item) => item.id !== id));
    try {
      await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast({ message: "Removed.", tone: "success" });
    } catch {
      toast({ message: "Failed to remove item.", tone: "error" });
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
      toast({ message: "File added to knowledge.", tone: "success" });
    } catch {
      toast({ message: "Failed to save the file.", tone: "error" });
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
    toast({ message: "Details applied. Remember to save.", tone: "info" });
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
      toast({ message: "Changes saved.", tone: "success" });
    } catch {
      toast({ message: "Failed to save changes.", tone: "error" });
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
    toast({ message: "Booking captured from the live session.", tone: "success" });
  };

  const startVoiceSession = (autoConnect = false) => {
    setVoiceAutoConnect(autoConnect);
    setShowVoiceConsole(true);
  };

  const configured = Boolean(profile.name?.trim());
  const heading = TAB_HEADINGS[activeTab];

  return (
    <>
      <AppShell
        title={heading.title}
        description={heading.description}
        activeTab={activeTab}
        onSelectTab={selectTab}
        status={{
          configured,
          modeLabel: assistantMode.status?.label ?? "Available",
          modeActive,
          modeExpiresAt: assistantMode.status?.expiresAt ?? null,
        }}
        onRefresh={() => loadAll()}
        refreshing={isRefreshing}
        lastSynced={lastSynced}
        onSignOut={handleSignOut}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => startVoiceSession(true)}>
            <PhoneCall className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Start live session</span>
            <span className="sm:hidden">Test</span>
          </Button>
        }
      >
        {activeTab === "overview" && (
          <div className="space-y-6">
            <AttentionBanner />
            <AssistantModeCard mode={assistantMode} />
            <OverviewSection
              calls={calls}
              callbacks={callbacks}
              messages={messages}
              knowledge={knowledgeItems}
              instructions={instructionItems}
              appointments={appointments}
              loading={isLoading}
              onOpenCall={openCall}
              onGoTo={selectTab}
              onToggleInstruction={toggleInstructionActive}
            />
            {!isLoading && (
              <p className="text-center text-xs text-muted-foreground">
                {contacts.length} contact{contacts.length === 1 ? "" : "s"} ·{" "}
                {crmStatus?.configured ? `CRM connected (${crmStatus.provider})` : "No CRM connected"}
                {bookingSettings
                  ? ` · Booking window ${bookingSettings.openTime}–${bookingSettings.closeTime}`
                  : ""}
              </p>
            )}
          </div>
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
            onCloseDetail={() => setSelectedCallId(null)}
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
            onGoToInstructions={() => selectTab("instructions")}
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

        {isLoading && !["overview", "calls", "knowledge"].includes(activeTab) && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
      </AppShell>

      <VoiceConsole
        open={showVoiceConsole}
        onClose={() => {
          setShowVoiceConsole(false);
          setVoiceAutoConnect(false);
          loadAll(true);
        }}
        companyProfile={profile}
        onBookAppointment={handleBookedFromCall}
        autoConnect={voiceAutoConnect}
        onAutoConnectHandled={() => setVoiceAutoConnect(false)}
      />
    </>
  );
}

const NAV_KEYS: DashboardTab[] = ["overview", "calls", "knowledge", "instructions", "voice"];
