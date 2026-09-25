"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Mic, Save, Settings2, Sparkles, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import ProviderSettings from "@/components/dashboard/ProviderSettings";
import MobileBottomNav from "@/components/dashboard/MobileBottomNav";
import { cn } from "@/lib/utils";
import {
  CompanyProfile,
  VOICE_OPTIONS,
  VOICE_PITCHES,
  VOICE_SPEEDS,
  VoiceName,
  VoicePitch,
  VoiceSpeed,
} from "@/types";

const EMPTY_PROFILE: CompanyProfile = {
  name: "",
  industry: "",
  description: "",
  contactEmail: "",
  contactPhone: "",
  address: "",
  voiceName: "Aoede",
  voicePitch: "Normal",
  voiceSpeed: "Normal",
  greetingEnabled: true,
  greetingText: null,
};

export default function SettingsPage() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [initial, setInitial] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/company-profile", { cache: "no-store" });
      const data = (await response.json()) as CompanyProfile & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error || "Failed to load settings");
      const merged: CompanyProfile = { ...EMPTY_PROFILE, ...data };
      setProfile(merged);
      setInitial(merged);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => JSON.stringify(profile) !== JSON.stringify(initial),
    [profile, initial],
  );

  const defaultGreeting = `Thank you for calling ${profile.name || "me"}. This is my AI assistant, how can I help?`;
  const effectiveGreeting = profile.greetingText?.trim() || defaultGreeting;

  const save = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/company-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = (await response.json()) as { profile?: CompanyProfile; error?: string };
      if (!response.ok || data.error) throw new Error(data.error || "Failed to save settings");
      if (data.profile) {
        const merged = { ...EMPTY_PROFILE, ...data.profile };
        setProfile(merged);
        setInitial(merged);
      }
      setSavedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const patch = (changes: Partial<CompanyProfile>) => setProfile((prev) => ({ ...prev, ...changes }));

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:pt-[calc(env(safe-area-inset-top)+2rem)]">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1"
            title="Back to dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">KeralAI</p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Settings</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Voice, greeting, workspace, and provider credentials. Saved and applied to new calls.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <Button className="w-full gap-2 sm:w-auto" onClick={save} disabled={isSaving || !dirty}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-28 sm:px-6 lg:pb-14">
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading settings…
          </div>
        ) : (
          <>
            {/* Voice */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-emerald-600" /> Voice
                </CardTitle>
                <CardDescription>Choose the voice your assistant speaks with.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {VOICE_OPTIONS.map((voice) => {
                    const active = profile.voiceName === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => patch({ voiceName: voice.id as VoiceName })}
                        className={cn(
                          "flex flex-col items-start rounded-2xl border p-4 text-left transition",
                          active
                            ? "border-emerald-300 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-200"
                            : "border-slate-100 bg-white hover:border-emerald-200",
                        )}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="text-sm font-semibold text-slate-900">{voice.label}</span>
                          <Badge variant={active ? "accent" : "secondary"}>{voice.gender}</Badge>
                        </div>
                        <span className="mt-1 text-xs text-slate-500">{voice.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Modulation */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-emerald-600" /> Modulation
                </CardTitle>
                <CardDescription>Pitch and speed applied to your assistant&apos;s voice.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Pitch</p>
                  <div className="flex gap-2">
                    {VOICE_PITCHES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => patch({ voicePitch: option as VoicePitch })}
                        className={cn(
                          "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                          profile.voicePitch === option
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Speed</p>
                  <div className="flex gap-2">
                    {VOICE_SPEEDS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => patch({ voiceSpeed: option as VoiceSpeed })}
                        className={cn(
                          "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                          profile.voiceSpeed === option
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Greeting */}
            <Card className="shadow-card">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600" /> Opening greeting
                  </CardTitle>
                  <CardDescription>
                    Turn off when an Exotel greeting/IVR applet already greets the caller.
                  </CardDescription>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(profile.greetingEnabled)}
                  onClick={() => patch({ greetingEnabled: !profile.greetingEnabled })}
                  className={cn(
                    "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition",
                    profile.greetingEnabled ? "bg-emerald-500" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                      profile.greetingEnabled ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    Custom greeting (optional)
                  </p>
                  <Textarea
                    value={profile.greetingText ?? ""}
                    onChange={(e) => patch({ greetingText: e.target.value })}
                    rows={3}
                    placeholder={defaultGreeting}
                    className="resize-none"
                    disabled={!profile.greetingEnabled}
                  />
                </div>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Preview</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {profile.greetingEnabled
                      ? `Assistant: “${effectiveGreeting}”`
                      : "Greeting off — the assistant waits for the caller to speak first."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <ProviderSettings />
      </main>
      <MobileBottomNav linkMode activeRoute="settings" />
    </div>
  );
}
