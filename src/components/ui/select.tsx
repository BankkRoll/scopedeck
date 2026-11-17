import { Select as RadixSelect } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { controlClass } from "./field";

/** One choice in a {@link Select}. */
export interface SelectOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Plain text used for typeahead when `label` is not a string. */
  textValue?: string;
}

/** Props for {@link Select}. */
export interface SelectProps<V extends string> {
  id?: string;
  /** The selected value, or `""` to show the placeholder. */
  value: V | "";
  onValueChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

/**
 * A styled single-choice dropdown for short, fixed lists. Long or searchable lists use
 * `Combobox` instead.
 */
export function Select<V extends string>({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: SelectProps<V>) {
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={(next) => {
        const match = options.find((option) => option.value === next);
        if (match) onValueChange(match.value);
      }}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className={cn(
          controlClass,
          "flex h-8 items-center justify-between gap-2 px-2.5 text-left data-[placeholder]:text-faint",
          className,
        )}
      >
        <span className="truncate">
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon className="text-faint">
          <ChevronDown className="size-3.5" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content position="popper" sideOffset={4} className={popoverClass}>
          <RadixSelect.Viewport className="max-h-72 p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                textValue={option.textValue}
                className={itemClass}
              >
                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator className="ml-auto text-accent">
                  <Check className="size-3.5" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

/** Shared surface for floating menus so dropdowns, pickers and popovers match. */
export const popoverClass =
  "z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line-strong bg-surface text-[13px] text-ink";

/** Shared row style for menu items; highlighted by keyboard or pointer via data attributes. */
export const itemClass =
  "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 outline-none select-none data-[disabled=true]:opacity-45 data-[disabled='']:opacity-45 data-[highlighted]:bg-hover data-[selected=true]:bg-hover";
