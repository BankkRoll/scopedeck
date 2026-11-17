import { Checkbox as RadixCheckbox } from "radix-ui";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Props for {@link Checkbox}. Indeterminate state is not used anywhere, so it is not exposed. */
export interface CheckboxProps extends Omit<
  ComponentProps<typeof RadixCheckbox.Root>,
  "checked" | "onCheckedChange"
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** A styled checkbox. Pair it with a `<label htmlFor>` for its accessible name. */
export function Checkbox({ className, checked, onCheckedChange, ...props }: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      checked={checked}
      onCheckedChange={(next) => {
        onCheckedChange(next === true);
      }}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-line-strong bg-raised transition-colors hover:border-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="text-accent-ink">
        <Check className="size-3" strokeWidth={3} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
