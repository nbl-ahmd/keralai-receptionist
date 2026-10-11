
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/AuthForms";

export const metadata = {
  referrer: "no-referrer" as const,
  title: "Create your workspace — KeralAI",
  description: "Create a KeralAI workspace and start handling calls.",
};

function RegisterFallback() {
  return <div className="h-72 animate-pulse rounded-2xl bg-slate-100" aria-hidden />;
}

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow={"Closed alpha"}
      title="Create your workspace"
      description="Each account gets its own private workspace. Configure your assistant and try it in your browser."
      footer={
        <span>
          By continuing you agree to use the assistant responsibly and to keep your own callers informed.
        </span>
      }
    >
      <Suspense fallback={<RegisterFallback />}>
        <RegisterForm alpha />
      </Suspense>
    </AuthShell>
  );
}
export const dynamic = "force-dynamic";
