"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Mic, Save, Settings2, Sparkles, User } from "lucide-react";

import AppShell from "@/components/app/AppShell";
import ProviderSettings from "@/components/dashboard/ProviderSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { Segmented } from "@/components/ui/segmented";
import { SettingsSection } from "@/components/ui/section";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch, SwitchField } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
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
  assistantName: "",
  assistantLanguage: "",
  additionalInfo: "",
  endCallEnabled: true,
};

export default function SettingsPage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [initial, setInitial] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const dirty = useMemo(() => JSON.stringify(profile) !== JSON.stringify(initial), [profile, initial]);

  const assistantName = profile.assistantName?.trim();
  const defaultGreeting = assistantName
    ? `Hi, this is ${assistantName} from ${profile.name || "the team"}. How can I help?`
    : `Hi, you've reached ${profile.name || "the team"}. How can I help?`;
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
      setError(null);
      toast({ message: "Settings saved.", tone: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      setError(message);
      toast({ message, tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const patch = (changes: Partial<CompanyProfile>) => setProfile((prev) => ({ ...prev, ...changes }));

  return (
    <AppShell
      eyebrow="Workspace"
      title="Settings"
      description="Your assistant's identity, voice and provider credentials. Saved changes apply to new calls."
      activeRoute="settings"
      routeMode
      contentWidth="narrow"
      actions={
        <>
          {!dirty && !isLoading && (
            <span className="hidden items-center gap-1 text-xs font-medium text-emerald-700 sm:flex">
              <Check className="h-3.5 w-3.5" aria-hidden /> Saved
            </span>
          )}
          <Button size="sm" className="gap-1.5" onClick={save} disabled={isSaving || !dirty} loading={isSaving}>
            {!isSaving && <Save className="h-4 w-4" aria-hidden />}
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error && <Notice tone="error">{error}</Notice>}

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : (
          <>
            {/* Assistant profile */}
            <SettingsSection
              icon={User}
              title="Assistant profile"
              description="The facts your assistant uses to represent this workspace. It never invents details, so keep this accurate."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business / owner name">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      value={profile.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      placeholder="e.g. Acme Clinic"
                      {...aria}
                    />
                  )}
                </Field>
                <Field label="Industry / what you do">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      value={profile.industry}
                      onChange={(e) => patch({ industry: e.target.value })}
                      placeholder="e.g. Dental clinic"
                      {...aria}
                    />
                  )}
                </Field>
                <Field label="Assistant name" hint="How the assistant introduces itself.">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      value={profile.assistantName ?? ""}
                      onChange={(e) => patch({ assistantName: e.target.value })}
                      placeholder="e.g. Ava"
                      {...aria}
                    />
                  )}
                </Field>
                <Field label="Preferred language">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      value={profile.assistantLanguage ?? ""}
                      onChange={(e) => patch({ assistantLanguage: e.target.value })}
                      placeholder="e.g. Malayalam and English"
                      {...aria}
                    />
                  )}
                </Field>
                <Field label="Contact email">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      type="email"
                      autoComplete="email"
                      value={profile.contactEmail}
                      onChange={(e) => patch({ contactEmail: e.target.value })}
                      placeholder="hello@example.com"
                      {...aria}
                    />
                  )}
                </Field>
                <Field label="Contact phone">
                  {({ id, ...aria }) => (
                    <Input
                      id={id}
                      type="tel"
                      autoComplete="tel"
                      value={profile.contactPhone}
                      onChange={(e) => patch({ contactPhone: e.target.value })}
                      placeholder="+91 …"
                      {...aria}
                    />
                  )}
                </Field>
              </div>

              <Field label="Location">
                {({ id, ...aria }) => (
                  <Input
                    id={id}
                    value={profile.address}
                    onChange={(e) => patch({ address: e.target.value })}
                    placeholder="e.g. Kochi, Kerala"
                    {...aria}
                  />
                )}
              </Field>

              <Field label="About" hint="What this business does and how calls should be handled.">
                {({ id, ...aria }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={profile.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    placeholder="Describe your business and the tone the assistant should use."
                    {...aria}
                  />
                )}
              </Field>

              <Field
                label="Additional approved information"
                hint="Extra facts the assistant may share: hours, services, policies, FAQs."
              >
                {({ id, ...aria }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={profile.additionalInfo ?? ""}
                    onChange={(e) => patch({ additionalInfo: e.target.value })}
                    placeholder="Open Mon–Sat, 9 AM to 6 PM. Closed on public holidays."
                    {...aria}
                  />
                )}
              </Field>

              <SwitchField
                label="End the call automatically"
                description="Hang up after the caller clearly signals they are finished."
                checked={profile.endCallEnabled !== false}
                onCheckedChange={(checked) => patch({ endCallEnabled: checked })}
              />
            </SettingsSection>

            {/* Voice */}
            <SettingsSection
              icon={Mic}
              title="Voice"
              description="Choose the voice your assistant speaks with on calls."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {VOICE_OPTIONS.map((voice) => {
                  const active = profile.voiceName === voice.id;
                  return (
                    <button
                      key={voice.id}
                      type="button"
                      onClick={() => patch({ voiceName: voice.id as VoiceName })}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col items-start rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-primary/40 bg-primary-soft/50"
                          : "border-border bg-card hover:border-primary/20 hover:bg-surface-2",
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{voice.label}</span>
                        <Badge variant={active ? "default" : "secondary"}>{voice.gender}</Badge>
                      </div>
                      <span className="mt-1 text-xs text-muted-foreground">{voice.desc}</span>
                    </button>
                  );
                })}
              </div>
            </SettingsSection>

            {/* Modulation */}
            <SettingsSection
              icon={Settings2}
              title="Modulation"
              description="Fine-tune pitch and speaking speed."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Pitch</p>
                  <Segmented
                    value={(profile.voicePitch ?? "Normal") as VoicePitch}
                    onValueChange={(value) => patch({ voicePitch: value })}
                    options={VOICE_PITCHES.map((option) => ({ value: option, label: option }))}
                    aria-label="Voice pitch"
                  />
                </div>
                <div>
                  <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Speed</p>
                  <Segmented
                    value={(profile.voiceSpeed ?? "Normal") as VoiceSpeed}
                    onValueChange={(value) => patch({ voiceSpeed: value })}
                    options={VOICE_SPEEDS.map((option) => ({ value: option, label: option }))}
                    aria-label="Speaking speed"
                  />
                </div>
              </div>
            </SettingsSection>

            {/* Greeting */}
            <SettingsSection
              icon={Sparkles}
              title="Opening greeting"
              description="The first thing callers hear."
              status={
                <Switch
                  checked={Boolean(profile.greetingEnabled)}
                  onCheckedChange={(checked) => patch({ greetingEnabled: checked })}
                  aria-label="Enable opening greeting"
                />
              }
            >
              <Field
                label="Custom greeting (optional)"
                hint={profile.greetingEnabled ? undefined : "Turn the greeting on to use a custom line."}
              >
                {({ id, ...aria }) => (
                  <Textarea
                    id={id}
                    value={profile.greetingText ?? ""}
                    onChange={(e) => patch({ greetingText: e.target.value })}
                    rows={3}
                    placeholder={defaultGreeting}
                    disabled={!profile.greetingEnabled}
                    {...aria}
                  />
                )}
              </Field>
              <div className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                <p className="mt-1 text-sm text-foreground">
                  {profile.greetingEnabled
                    ? `Assistant: “${effectiveGreeting}”`
                    : "Greeting off — the assistant waits for the caller to speak first."}
                </p>
              </div>
            </SettingsSection>
          </>
        )}

        <ProviderSettings />
      </div>
    </AppShell>
  );
}
