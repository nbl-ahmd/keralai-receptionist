"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Headset,
  Languages,
  Lock,
  MessageSquarePlus,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import AgentDemo, { type DemoAgent } from "@/components/AgentDemo";
import CallPreview from "@/components/CallPreview";
import DashboardPreview from "@/components/DashboardPreview";
import { Button } from "@/components/ui/button";
import { CompanyProfile } from "@/types";

const NAV = [
  { label: "How it works", href: "#how" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Dashboard", href: "#dashboard" },
  { label: "Live demo", href: "#demo" },
];

const ASSISTANT_AGENT: DemoAgent = {
  id: "reception",
  name: "KeralAI assistant",
  blurb: "Answers questions, takes messages, and books time on your behalf.",
  icon: Headset,
  greeting: "Namaskaram, this is the KeralAI assistant. How can I help you today?",
  sampleQuestions: [
    "When is Nabeel available?",
    "Can you pass on a message?",
    "Please ask him to call me back.",
  ],
};

const STEPS = [
  {
    title: "Tell it about you",
    body: "Add what your assistant should know — your work, hours, and how you like calls handled.",
    icon: BookOpen,
  },
  {
    title: "Choose how it sounds",
    body: "Pick a voice, pace, and greeting that feel natural for the people who call you.",
    icon: Languages,
  },
  {
    title: "It answers, you stay informed",
    body: "Calls are handled, messages and callbacks are captured, and you review everything later.",
    icon: PhoneCall,
  },
];

const CAPABILITIES = [
  {
    icon: Languages,
    title: "Malayalam, English and Manglish",
    body: "Callers can switch language mid-sentence. The assistant follows naturally, the way people actually speak in Kerala.",
  },
  {
    icon: MessageSquarePlus,
    title: "Messages and callbacks, captured",
    body: "When you can't talk, it takes a clear message and records callback requests with the caller's details.",
  },
  {
    icon: Zap,
    title: "Active instructions for right now",
    body: "Add a temporary instruction — \"I'm in a meeting until 5\" — and it applies to every new call until you turn it off.",
  },
  {
    icon: BookOpen,
    title: "Answers grounded in what you approved",
    body: "It only uses the knowledge you've added. If something isn't covered, it takes a message instead of guessing.",
  },
  {
    icon: CalendarClock,
    title: "Appointments and follow-ups",
    body: "It can arrange times with callers and keeps every booking in one place for you to review.",
  },
  {
    icon: ShieldCheck,
    title: "It doesn't pretend to be you",
    body: "The assistant identifies itself as AI, answers from approved information, and never invents your availability.",
  },
];

const TRUST = [
  {
    icon: Lock,
    text: "Only the knowledge you approve is used when answering.",
  },
  {
    icon: ShieldCheck,
    text: "Every call is transcribed so you can see exactly what was said.",
  },
  {
    icon: Check,
    text: "It never claims you're free or available unless you've told it so.",
  },
];

export default function LandingPage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    fetch("/api/company-profile")
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error && data.name) setProfile(data);
      })
      .catch(() => undefined);
  }, []);

  const scrollToDemo = () => {
    document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="KeralAI home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
              KA
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">KeralAI</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button size="sm" className="gap-2" onClick={scrollToDemo}>
              <PhoneCall className="h-4 w-4" /> Talk to it
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-24 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" /> Personal AI phone assistant
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl">
              Your calls, handled. You stay informed.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              KeralAI answers when you can&apos;t, talks naturally in Malayalam, English or Manglish,
              takes messages and callbacks, and tells you what happened — without pretending to be you.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="w-full gap-2 sm:w-auto" onClick={scrollToDemo}>
                <PhoneCall className="h-5 w-5" /> Try the live assistant
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full gap-2 sm:w-auto">
                <Link href="/dashboard">
                  Open the dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              No signup for the demo — just allow microphone access and speak.
            </p>
          </div>

          <div className="relative">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Product preview</p>
            <CallPreview />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Set it up once, then let it answer
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Three steps to a personal assistant that handles your calls the way you want.
            </p>
          </div>

          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                    {index + 1}
                  </span>
                  <step.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="border-t border-slate-200/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              What it can do
            </h2>
            <p className="mt-3 max-w-sm text-base leading-relaxed text-slate-600">
              Built for real conversations with the people who call you — not scripted phone trees.
            </p>
          </div>

          <ul className="divide-y divide-slate-200/70">
            {CAPABILITIES.map((item) => (
              <li key={item.title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <item.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Dashboard preview */}
      <section id="dashboard" className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              One calm place for everything that happened
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Review calls and transcripts, read messages and callback requests, manage what your
              assistant knows, and switch temporary instructions on or off.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Recent calls with summaries and transcripts",
                "Messages and callback requests in one list",
                "Knowledge your assistant can reference",
                "Active instructions, clearly separated from knowledge",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {line}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" className="mt-7 gap-2">
              <Link href="/dashboard">
                Explore the dashboard <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* Live demo */}
      <section id="demo" className="border-t border-slate-200/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Talk to the assistant
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              A real conversation with the same engine that handles live calls, with transcription as you speak.
            </p>
          </div>
          <div className="mt-10">
            <AgentDemo
              agents={[ASSISTANT_AGENT]}
              companyProfile={profile ?? undefined}
              onBuildAgent={() => {
                window.location.href = "/dashboard";
              }}
            />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Honest by design
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                Your assistant represents you, but it never pretends to be you or invents an answer.
              </p>
            </div>
            <ul className="space-y-4">
              {TRUST.map((item) => (
                <li key={item.text} className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600 ring-1 ring-slate-200/70">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <p className="text-sm leading-relaxed text-slate-700">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200/70">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-card sm:flex-row sm:p-10">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                Ready when you are
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                Open the dashboard to set up your assistant, or start with the live demo to hear how it sounds.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Button size="lg" className="w-full gap-2 sm:w-auto" onClick={scrollToDemo}>
                <PhoneCall className="h-5 w-5" /> Try the demo
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full gap-2 sm:w-auto">
                <Link href="/dashboard">Set up dashboard</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/70 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-[10px] font-bold text-white">
              KA
            </span>
            <span className="text-sm font-medium text-slate-600">KeralAI</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <span className="hidden items-center gap-1.5 sm:flex">
              <Languages className="h-4 w-4" /> Malayalam · English
            </span>
            <Link href="/privacy" className="font-medium text-slate-600 transition-colors hover:text-emerald-700">
              Privacy
            </Link>
            <Link href="/dashboard" className="font-medium text-slate-600 transition-colors hover:text-emerald-700">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
