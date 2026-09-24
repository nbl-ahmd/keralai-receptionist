import { Loader2, Mic, PhoneCall, Save, ShieldCheck, Sparkles, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

interface VoiceSectionProps {
  profile: CompanyProfile;
  isSaving: boolean;
  onPatch: (patch: Partial<CompanyProfile>) => void;
  onSave: () => void;
  onStartSession: () => void;
}

export function VoiceSection({ profile, isSaving, onPatch, onSave, onStartSession }: VoiceSectionProps) {
  const defaultGreeting = `Thank you for calling ${profile.name || "me"}. This is my AI assistant, how can I help?`;
  const effectiveGreeting = profile.greetingText?.trim() || defaultGreeting;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-emerald-600" /> Assistant voice
            </CardTitle>
            <CardDescription>Choose how your assistant sounds on calls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600">Voice</label>
              <Select
                value={profile.voiceName ?? "Aoede"}
                onValueChange={(value) => onPatch({ voiceName: value as VoiceName })}
              >
                <SelectTrigger className="mt-1" aria-label="Assistant voice">
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
                <label className="text-xs font-medium text-slate-600">Pitch</label>
                <div className="mt-1 flex rounded-xl bg-slate-100 p-1">
                  {VOICE_PITCHES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onPatch({ voicePitch: option as VoicePitch })}
                      aria-pressed={profile.voicePitch === option}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                        profile.voicePitch === option
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Speed</label>
                <div className="mt-1 flex rounded-xl bg-slate-100 p-1">
                  {VOICE_SPEEDS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onPatch({ voiceSpeed: option as VoiceSpeed })}
                      aria-pressed={profile.voiceSpeed === option}
                      className={cn(
                        "flex-1 rounded-lg py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                        profile.voiceSpeed === option
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Sparkles className="h-4 w-4 text-emerald-600" /> Opening greeting
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Turn off if your phone system already greets the caller.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile.greetingEnabled !== false}
                  aria-label="Toggle opening greeting"
                  onClick={() => onPatch({ greetingEnabled: !(profile.greetingEnabled !== false) })}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                    profile.greetingEnabled !== false ? "bg-emerald-500" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                      profile.greetingEnabled !== false ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </div>
              <Textarea
                value={profile.greetingText ?? ""}
                onChange={(e) => onPatch({ greetingText: e.target.value })}
                rows={2}
                placeholder={defaultGreeting}
                aria-label="Custom greeting"
                className="mt-3 resize-none"
                disabled={profile.greetingEnabled === false}
              />
              <p className="mt-2 text-xs text-slate-500">
                {profile.greetingEnabled === false
                  ? "Greeting off — the assistant waits for the caller to speak first."
                  : `Preview: “${effectiveGreeting}”`}
              </p>
            </div>

            <Button onClick={onSave} disabled={isSaving} className="w-full gap-1.5">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save voice settings
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 bg-slate-50/60">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-medium text-slate-900">AI, clearly disclosed</p>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">
              Your assistant identifies itself as an AI assistant, answers from approved information, and never
              claims you are available unless you&apos;ve said so.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4 text-emerald-600" /> Assistant profile
            </CardTitle>
            <CardDescription>Basic details the assistant uses to introduce you accurately.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="profile-name" className="text-xs font-medium text-slate-600">
                  Your name
                </label>
                <Input
                  id="profile-name"
                  value={profile.name}
                  onChange={(e) => onPatch({ name: e.target.value })}
                  placeholder="e.g. Nabeel"
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="profile-role" className="text-xs font-medium text-slate-600">
                  What you do
                </label>
                <Input
                  id="profile-role"
                  value={profile.industry}
                  onChange={(e) => onPatch({ industry: e.target.value })}
                  placeholder="e.g. Software engineer"
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="profile-email" className="text-xs font-medium text-slate-600">
                  Email
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  value={profile.contactEmail}
                  onChange={(e) => onPatch({ contactEmail: e.target.value })}
                  placeholder="you@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <label htmlFor="profile-phone" className="text-xs font-medium text-slate-600">
                  Phone
                </label>
                <Input
                  id="profile-phone"
                  type="tel"
                  value={profile.contactPhone}
                  onChange={(e) => onPatch({ contactPhone: e.target.value })}
                  placeholder="+91 …"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label htmlFor="profile-location" className="text-xs font-medium text-slate-600">
                Location
              </label>
              <Input
                id="profile-location"
                value={profile.address}
                onChange={(e) => onPatch({ address: e.target.value })}
                placeholder="e.g. Kochi, Kerala"
                className="mt-1"
              />
            </div>
            <div>
              <label htmlFor="profile-about" className="text-xs font-medium text-slate-600">
                About you
              </label>
              <Textarea
                id="profile-about"
                rows={3}
                value={profile.description}
                onChange={(e) => onPatch({ description: e.target.value })}
                placeholder="What you work on, and how you'd like calls handled."
                className="mt-1 resize-none"
              />
            </div>
            <Button onClick={onSave} disabled={isSaving} variant="outline" className="gap-1.5">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-emerald-600" /> Live session
            </CardTitle>
            <CardDescription>
              Open a real browser call to hear your assistant and test it before anyone else does.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full gap-1.5" onClick={onStartSession}>
              <PhoneCall className="h-4 w-4" /> Start live session
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default VoiceSection;
