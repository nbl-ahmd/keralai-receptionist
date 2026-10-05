import * as React from "react";

import { cn } from "@/lib/utils";

export function Label({
  className,
  children,
  hint,
  htmlFor,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("flex items-center justify-between gap-2 text-sm font-medium text-foreground", className)}
      {...props}
    >
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-xs font-medium text-destructive">
      {children}
    </p>
  );
}

export function FieldHint({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Layout helper that wires a label, control, hint and error together with the
 * correct `htmlFor` / `aria-describedby` relationships.
 */
export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Render prop receiving the generated id and describedby target. */
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": Boolean(error) || undefined })}
      <FieldError id={errorId}>{error}</FieldError>
      <FieldHint id={hintId}>{hint}</FieldHint>
    </div>
  );
}
