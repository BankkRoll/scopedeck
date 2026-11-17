import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm border border-line-strong px-1.5 text-[13px] leading-none whitespace-nowrap text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-raised px-1 font-mono text-[13px] leading-none text-muted",
        className,
      )}
      {...props}
    />
  );
}
