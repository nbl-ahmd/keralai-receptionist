import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Mic, PhoneCall, Save, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CompanyProfile,
  VOICE_OPTIONS,
  VOICE_PITCHES,
  VOICE_SPEEDS,
  VoiceName,
  VoicePitch,
  VoiceSpeed,
} from "@/types";

interface VoiceSectionProps {
  profile: CompanyProfile;
  isSaving: boolean;
  onPatch: (patch: Partial<CompanyProfile>) => void;
  onSave: () => void;
  onStartSession: () => void;
}

/**
 * Voice tab: how the assistant sounds and a one-tap live test. Business/owner
 * details live in Settings so this view stays focused on voice.
 */
export function VoiceSection({ profile, isSaving, onPatch, onSave, onStartSession }: VoiceSectionProps) {
  const assistantName = profile.assistantName?.trim();
  const defaultGreeting = assistantName
    ? `Hi, this is ${assistantName} from ${profile.name || "the team"}. How can I help?`
    : `Hi, you've reached ${profile.name || "the team"}. How can I help?`;
  const effectiveGreeting = profile.greetingText?.trim() || defaultGreeting;
  const greetingOn = profile.greetingEnabled !== false;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Mic className="h-4 w-4 text-primary" aria-hidden /> Assistant voice
            </CardTitle>
            <CardDescription>Choose how your assistant sounds on calls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="voice-name" className="text-sm font-medium text-foreground">
                Voice
              </label>
              <Select
                value={profile.voiceName ?? "Aoede"}
                onValueChange={(value) => onPatch({ voiceName: value as VoiceName })}
              >
                <SelectTrigger id="voice-name" aria-label="Assistant voice">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.label} — {voice.desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Pitch</p>
                <Segmented
                  value={(profile.voicePitch ?? "Normal") as VoicePitch}
                  onValueChange={(value) => onPatch({ voicePitch: value })}
                  options={VOICE_PITCHES.map((option) => ({ value: option, label: option }))}
                  aria-label="Voice pitch"
                />
              </div>
              <div>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Speed</p>
                <Segmented
                  value={(profile.voiceSpeed ?? "Normal") as VoiceSpeed}
                  onValueChange={(value) => onPatch({ voiceSpeed: value })}
                  options={VOICE_SPEEDS.map((option) => ({ value: option, label: option }))}
                  aria-label="Speaking speed"
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Opening greeting
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Turn off if your phone system already greets the caller.
                  </p>
                </div>
                <Switch
                  checked={greetingOn}
                  onCheckedChange={(checked) => onPatch({ greetingEnabled: checked })}
                  aria-label="Enable opening greeting"
                />
              </div>
              <Textarea
                value={profile.greetingText ?? ""}
                onChange={(e) => onPatch({ greetingText: e.target.value })}
                rows={2}
                placeholder={defaultGreeting}
                aria-label="Custom greeting"
                className="mt-3 resize-none"
                disabled={!greetingOn}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {greetingOn
                  ? `Preview: “${effectiveGreeting}”`
                  : "Greeting off — the assistant waits for the caller to speak first."}
              </p>
            </div>

            <Button onClick={onSave} disabled={isSaving} className="w-full gap-2" loading={isSaving}>
              {!isSaving && <Save className="h-4 w-4" aria-hidden />}
              Save voice settings
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border bg-surface-2/60">
          <CardContent className="flex flex-col gap-2 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
              <p className="text-sm font-medium text-foreground">AI, clearly disclosed</p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your assistant identifies itself as an AI assistant, answers from approved information, and never
              claims you are available unless you&apos;ve said so.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <PhoneCall className="h-4 w-4 text-primary" aria-hidden /> Test with a live session
            </CardTitle>
            <CardDescription>
              Open a real browser call to hear your assistant and test it before anyone else does.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-2" onClick={onStartSession}>
              <PhoneCall className="h-4 w-4" aria-hidden /> Start live session
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Allow microphone access when prompted. Settings take effect on the next session.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Workspace details</CardTitle>
            <CardDescription>
              Your business name, contact details and approved information feed the assistant&apos;s answers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full gap-2">
              <Link href={"/dashboard/settings" as Route}>
                Edit workspace details
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default VoiceSection;
