import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  initials?: string;
  color?: string;
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(({ className, initials, color, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-2xl border border-white text-sm font-bold text-white shadow-inner",
        className
      )}
      style={{ background: color || "linear-gradient(135deg, #0ea5e9, #22c55e)" }}
      {...props}
    >
      {initials}
    </div>
  );
});
Avatar.displayName = "Avatar";

export { Avatar };
