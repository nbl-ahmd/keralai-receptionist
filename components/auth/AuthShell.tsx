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
    body: "Malayalam, English and Manglish conversations grounded in the knowledge you approve.",
  },
  {
    icon: Headset,
    title: "Messages and callbacks, captured",
    body: "Every call is transcribed so you always know what was said and what was promised.",
  },
  {
    icon: ShieldCheck,
    title: "Private to your workspace",
    body: "Your knowledge, calls and provider keys stay isolated from every other account.",
  },
];

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="KeralAI home">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-xs">
        KA
      </span>
      <span className="font-display text-base font-semibold tracking-tight text-foreground">KeralAI</span>
    </Link>
  );
}

/**
 * Shared frame for the login and register pages. The brand panel is hidden on
 * small screens so the form stays the focus on phones; the form column is
 * vertically centred and safe-area aware.
 */
export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-app bg-background">
      <div className="mx-auto grid min-h-app max-w-6xl lg:grid-cols-2">
        <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card px-10 py-12 lg:flex xl:px-14">
          <Wordmark />

          <div className="max-w-sm">
            <h2 className="font-display text-3xl font-semibold leading-tight tracking-tight text-foreground">
              Your calls, handled. You stay informed.
            </h2>
            <ul className="mt-8 space-y-6">
              {HIGHLIGHTS.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">A personal AI phone assistant for Keralites.</p>
        </aside>

        <main className="flex flex-col justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+2.5rem)] sm:px-8 lg:px-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <Wordmark />
            </div>

            <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

            <div className="mt-8">{children}</div>

            <div className="mt-6 text-sm text-muted-foreground">{footer}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AuthShell;
