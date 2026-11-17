import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";

/** Wraps the app once so every {@link Tooltip} shares one delay and skip-delay window. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={300} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}

/** Props for {@link Tooltip}. */
export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Renders the trigger alone, for example when a label is already visible. */
  disabled?: boolean;
}

/** A small label shown on hover or keyboard focus. The child must accept a ref. */
export function Tooltip({ content, children, side = "right", disabled }: TooltipProps) {
  if (disabled) return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          className="z-50 flex items-center gap-2 rounded-md border border-line-strong bg-surface px-2 py-1 text-[12px] text-ink"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
