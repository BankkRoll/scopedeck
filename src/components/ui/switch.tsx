import { Switch as RadixSwitch } from "radix-ui";
import { cn } from "@/lib/cn";

/** Props for {@link Switch}. */
export interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** An on/off toggle for settings that take effect immediately. */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <RadixSwitch.Root
      className={cn(
        "inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-line-strong bg-raised p-px transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block size-3.5 rounded-full bg-muted transition-transform duration-150 data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-accent-ink" />
    </RadixSwitch.Root>
  );
}
