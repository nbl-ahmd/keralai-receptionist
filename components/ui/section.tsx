import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A settings section: titled card with an optional status slot. Keeps every
 * configuration surface visually identical (workspace, Gemini, CRM, Exotel…).
 */
export function SettingsSection({
  icon: Icon,
  title,
  description,
  status,
  children,
  className,
  id,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card className={cn("scroll-mt-24", className)} id={id}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 font-display">
            {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden />}
            {title}
          </CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {status && <div className="flex shrink-0 flex-wrap items-center gap-2">{status}</div>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

/** A labelled row inside a settings section. */
export function SettingsRow({
  label,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default SettingsSection;
