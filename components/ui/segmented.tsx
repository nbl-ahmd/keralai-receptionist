import * as React from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  size?: "sm" | "default";
}

/**
 * Compact single-select control (pitch, speed, filters). Renders as an
 * accessible radiogroup so it is operable by keyboard and announced correctly.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  disabled,
  className,
  size = "default",
  ...aria
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      className={cn(
        "flex w-full rounded-lg bg-surface-3 p-0.5",
        disabled && "opacity-60",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex-1 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              size === "sm" ? "min-h-[32px] px-2 text-xs" : "min-h-[36px] px-3 text-sm",
              active
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
