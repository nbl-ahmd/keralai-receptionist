import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Compact status label. Badges never carry meaning through colour alone — the
 * text always states the status, which keeps them usable in greyscale and for
 * screen readers.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default: "bg-primary-soft text-primary-soft-foreground ring-primary/15",
        secondary: "bg-surface-3 text-muted-foreground ring-border-strong/60",
        outline: "bg-card text-muted-foreground ring-border-strong/70",
        accent: "bg-primary text-primary-foreground ring-primary",
        success: "bg-success-soft text-emerald-800 ring-emerald-600/15",
        warning: "bg-warning-soft text-amber-800 ring-amber-600/20",
        danger: "bg-destructive-soft text-red-700 ring-red-600/20",
        info: "bg-info-soft text-sky-800 ring-sky-600/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
