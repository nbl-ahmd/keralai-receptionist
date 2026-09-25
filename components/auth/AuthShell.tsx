import Link from "next/link";
import { Headset, ShieldCheck, Sparkles } from "lucide-react";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: "Answers in your voice, your way",
    body: "Malayalam, English and Manglish conversations with the knowledge you approve.",
  },
  {
    icon: Headset,
    title: "Messages and callbacks, captured",
    body: "Every call is transcribed so you always know what happened.",
  },
  {
    icon: ShieldCheck,
    title: "Private to your workspace",
    body: "Your knowledge, calls, and provider keys stay isolated from every other account.",
  },
];

/**
 * Shared, responsive frame for the login and register pages. The brand panel is
 * hidden on small screens so the form stays the focus on phones.
 */
export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2">
        {/* Brand panel */}
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-slate-200/70 bg-white px-10 py-12 lg:flex xl:px-14">
          <Link href="/" className="flex items-center gap-2.5" aria-label="KeralAI home">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              KA
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">KeralAI</span>
          </Link>

          <div className="max-w-sm">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-slate-900">
              Your calls, handled. You stay informed.
            </h2>
            <ul className="mt-8 space-y-6">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-400">A personal AI phone assistant for Keralites.</p>
        </aside>

        {/* Form panel */}
        <main className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-sm">
            <Link
              href="/"
              className="mb-8 flex items-center gap-2.5 lg:hidden"
              aria-label="KeralAI home"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                KA
              </span>
              <span className="text-base font-semibold tracking-tight text-slate-900">KeralAI</span>
            </Link>

            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>

            <div className="mt-8">{children}</div>

            <div className="mt-6 text-sm text-slate-500">{footer}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AuthShell;