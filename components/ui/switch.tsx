"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Accessible toggle. Uses a real button with `role="switch"` so it is
 * keyboard-operable and announced correctly. Minimum hit area is 44px tall.
 */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  /** Required when the switch has no adjacent visible label. */
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, id, className, ...aria }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-slate-300",
        className,
      )}
      {...aria}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  ),
);
Switch.displayName = "Switch";

export interface SwitchFieldProps extends SwitchProps {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/**
 * A labelled switch rendered as a row. The whole row is not clickable (that
 * would block text selection); the label is associated via `htmlFor`.
 */
export function SwitchField({
  label,
  description,
  id,
  className,
  ...switchProps
}: SwitchFieldProps) {
  const reactId = React.useId();
  const switchId = id ?? reactId;
  const descId = description ? `${switchId}-desc` : undefined;

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-2 px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <label htmlFor={switchId} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        {description && (
          <p id={descId} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={switchId}
        aria-describedby={descId}
        className="mt-0.5"
        {...switchProps}
      />
    </div>
  );
}

export { Switch };
