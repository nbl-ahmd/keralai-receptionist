import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Inline activity indicator. `aria-label` is provided by the calling context. */
export function Spinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Loader2
      className={cn("h-4 w-4 shrink-0 animate-spin", className)}
      role="status"
      aria-label={label}
    />
  );
}

export default Spinner;
