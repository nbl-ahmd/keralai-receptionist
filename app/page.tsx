"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Globe2,
  Headset,
  Languages,
  LayoutDashboard,
  PhoneCall,
  Play,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import AgentDemo from "@/components/AgentDemo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyProfile } from "@/types";

const NAV = [
  { label: "Product", href: "#product" },
  { label: "Demo", href: "#demo" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
];

const CAPABILITIES = [
  { label: "Voice agents", icon: Headset },
  { label: "Text to speech", icon: Play },
  { label: "Speech to text", icon: Languages },
  { label: "Call analytics", icon: BarChart3 },
];

const FEATURES = [
  {
    icon: Headset,
    title: "Human-grade voice",
    body: "Natural, low-latency speech that handles interruptions and barge-in like a real receptionist.",
  },
  {
    icon: BookOpen,
    title: "Grounded in your knowledge",
    body: "Retrieval-augmented answers pulled from your own documents, pricing, and policies — never invented.",
  },
  {
    icon: CalendarCheck,
    title: "Books while it talks",
    body: "Captures name, date, and time and writes appointments straight into your calendar.",
  },
  {
    icon: Languages,
    title: "Malayalam + English",
    body: "Switches languages mid-sentence and handles Manglish naturally for Kerala callers.",
  },
  {
    icon: BarChart3,
    title: "Every call, reported",
    body: "Transcripts, intents, outcomes, and bookings captured automatically into one dashboard.",
  },
  {
    icon: ShieldCheck,
    title: "Production ready",
    body: "Phone bridge, live transcription, structured storage, and graceful fallbacks out of the box.",
  },
];

const STEPS = [
  { step: "01", title: "Add your knowledge", body: "Paste text, upload documents, or just describe your business in chat." },
  { step: "02", title: "Pick a voice", body: "Choose a persona, pitch, and pace that matches your brand." },
  { step: "03", title: "Go live", body: "Point your number at the bridge or embed the agent on your site." },
  { step: "04", title: "Review every call", body: "Read transcripts, confirm bookings, and patch knowledge gaps." },
];

const METRICS = [
  { value: "24/7", label: "Always answering" },
  { value: "<1s", label: "Response latency" },
  { value: "2", label: "Languages live" },
  { value: "100%", label: "Calls transcribed" },
];

export default function LandingPage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);

  // Ground the demo in the real configured business, when one exists.
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
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
              KA
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900">KeralAI</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
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
              <PhoneCall className="h-4 w-4" /> Try live demo
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="product" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.14),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.14),transparent_40%)]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 lg:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" /> Voice agents for real phone calls
            </Badge>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              An AI receptionist that
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                {" "}
                answers, books, and reports
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
              KeralAI picks up every call in Malayalam or English, answers from your own knowledge base, books
              appointments, and hands you a full transcript — no missed leads, no hold music.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="w-full gap-2 sm:w-auto" onClick={scrollToDemo}>
                <PhoneCall className="h-5 w-5" /> Start concierge
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full gap-2 sm:w-auto">
                <Link href="/dashboard">
                  <LayoutDashboard className="h-5 w-5" /> Open dashboard
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              No signup needed for the demo — just allow microphone access and talk.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {METRICS.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-slate-100 bg-white/70 p-5 text-center shadow-sm">
                <p className="text-2xl font-bold text-slate-900">{metric.value}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capability strip */}
      <section className="border-y border-slate-100 bg-slate-50/70">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-6 sm:px-6">
          {CAPABILITIES.map((item) => {
            const Icon = item.icon;
            return (
              <span key={item.label} className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Icon className="h-4 w-4 text-emerald-600" /> {item.label}
              </span>
            );
          })}
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Talk to an agent right now
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Pick an agent, hit start, and have a real conversation. This is the same engine that runs the
            production console — with live transcription.
          </p>
        </div>

        <div className="mt-10">
          <AgentDemo
            companyProfile={profile ?? undefined}
            onBuildAgent={() => {
              window.location.href = "/dashboard";
            }}
          />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-slate-100 bg-slate-50/70">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Everything a front desk needs
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Built for the full customer journey: the call, the action, and the report afterwards.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Live in four steps</h2>
          <p className="mt-4 text-lg text-slate-600">From zero to answering calls in an afternoon.</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.step} className="relative rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <span className="text-3xl font-bold text-emerald-200">{step.step}</span>
              <h3 className="mt-3 text-base font-bold text-slate-900">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 px-8 py-14 text-center sm:px-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.25),transparent_50%)]" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Stop missing calls
            </h2>
            <p className="mt-4 text-lg text-slate-300">
              Spin up an agent, load your knowledge, and let Maya handle the front desk around the clock.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="w-full gap-2 sm:w-auto" onClick={scrollToDemo}>
                <Play className="h-5 w-5" /> Try the demo
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full gap-2 border-white/20 bg-white/10 text-white hover:bg-white/20 sm:w-auto"
              >
                <Link href="/dashboard">
                  <Zap className="h-5 w-5" /> Open the console
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-bold text-white">
              KA
            </span>
            <span className="text-sm font-semibold text-slate-700">KeralAI Receptionist</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Globe2 className="h-4 w-4" /> Malayalam + English
            </span>
            <Link href="/dashboard" className="font-semibold text-slate-700 hover:text-emerald-700">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
