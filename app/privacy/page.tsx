import type { Metadata } from "next";
import Link from "next/link";
import {
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_INTRO,
  PRIVACY_LAST_UPDATED,
  PRIVACY_SECTIONS,
  type PrivacyBlock,
} from "./privacy-content";

export const metadata: Metadata = {
  title: "Privacy Policy — KeralAI",
  description:
    "How KeralAI collects, uses, discloses, stores, and protects information across its personal AI assistant, voice, WhatsApp automation, and integration services.",
  alternates: { canonical: "/privacy" },
};

function Blocks({ blocks }: { blocks: PrivacyBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "p") {
          return (
            <p key={index} className="mt-3 text-sm leading-6 text-slate-600">
              {block.text}
            </p>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={index} className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-600">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <div key={index} className="mt-6">
            <h3 className="text-base font-semibold text-slate-900">{block.title}</h3>
            <Blocks blocks={block.blocks} />
          </div>
        );
      })}
    </>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 pb-6 pt-6 sm:px-6 lg:pt-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-sm font-semibold text-slate-600 transition hover:text-emerald-700"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
            KA
          </span>
          KeralAI
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100"
        >
          Back to site
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Legal</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Privacy Policy</h1>
          <div className="mt-4 flex flex-col gap-1 text-sm text-slate-500 sm:flex-row sm:gap-6">
            <span>
              <strong className="font-semibold text-slate-700">Effective Date:</strong> {PRIVACY_EFFECTIVE_DATE}
            </span>
            <span>
              <strong className="font-semibold text-slate-700">Last Updated:</strong> {PRIVACY_LAST_UPDATED}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {PRIVACY_INTRO.map((paragraph, index) => (
              <p key={index} className="text-sm leading-6 text-slate-600">
                {paragraph}
              </p>
            ))}
          </div>

          {/* Table of contents */}
          <nav className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Contents</p>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {PRIVACY_SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-sm text-slate-600 transition hover:text-emerald-700"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-10 divide-y divide-slate-100">
            {PRIVACY_SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24 pt-8">
                <h2 className="text-xl font-bold text-slate-900">{section.title}</h2>
                <Blocks blocks={section.blocks} />
              </section>
            ))}
          </div>

          <div className="mt-12 rounded-2xl border border-slate-100 bg-slate-50 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Questions about this policy?</p>
            <p className="mt-1">
              Contact us using the details in section 21, or reach out through the contact information on the
              KeralAI website.
            </p>
          </div>
        </article>

        <p className="mt-8 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} KeralAI. All rights reserved.
        </p>
      </main>
    </div>
  );
}
