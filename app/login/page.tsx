import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/AuthForms";

export const metadata = {
  title: "Sign in — KeralAI",
  description: "Sign in to your KeralAI workspace.",
};

function LoginFallback() {
  return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" aria-hidden />;
}

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to your workspace"
      description="Manage your assistant, review calls, and control what it knows."
      footer={
        <span>
          Trouble signing in? Check your email and password, or create a new workspace.
        </span>
      }
    >
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
export const dynamic = "force-dynamic";
