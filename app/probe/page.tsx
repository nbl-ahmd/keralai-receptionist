import { Suspense } from "react";

import ProbeClient from "./ProbeClient";

export const dynamic = "force-dynamic";

export default function ProbePage() {
  return (
    <div className="p-10">
      <h1 className="text-xl font-semibold">Probe + trivial client</h1>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}>
        <ProbeClient />
      </Suspense>
    </div>
  );
}
