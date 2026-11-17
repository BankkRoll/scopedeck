import { Dialog as RadixDialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Props for {@link Sheet}. */
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Pinned below the scrolling body, for apply and reset actions. */
  footer?: ReactNode;
  className?: string;
}

/** A panel that slides in from the right edge, used for filters and secondary detail. */
export function Sheet({ open, onOpenChange, title, description, children, footer, className }: SheetProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="sheet-overlay fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          className={cn(
            "sheet-panel fixed inset-y-0 right-0 z-50 flex w-[min(420px,100vw)] flex-col border-l border-line-strong bg-surface outline-none",
            className,
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-5">
            <div className="min-w-0">
              <RadixDialog.Title className="truncate text-[15px] font-semibold tracking-tight">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="truncate text-[12px] text-faint">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="grid size-7 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink"
            >
              <X className="size-4" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? (
            <div className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
