import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "radix-ui";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { controlClass } from "./field";
import { itemClass } from "./select";

/** One choice in a {@link Combobox}. */
export interface ComboboxOption {
  value: string;
  label: string;
  /** Secondary text shown after the label and included in search. */
  detail?: string;
  /** Leading visual, such as a program logo. */
  icon?: ReactNode;
  /** Options with the same group render under one heading, in first-seen order. */
  group?: string;
  /** Extra search terms that are not displayed. */
  keywords?: string[];
}

/** Props for {@link Combobox}. */
export interface ComboboxProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: readonly ComboboxOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** When set, adds a first option with this label that clears the selection. */
  noneLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
}

const NONE = "\u0000none";

function rank(haystack: string, needle: string): number {
  if (!needle) return 1;
  const index = haystack.indexOf(needle);
  if (index === -1) return 0;
  return index === 0 ? 1 : 0.5;
}

/**
 * A searchable single-choice picker for long lists such as programs, assets and weaknesses.
 * Matching is case-insensitive substring over the label, detail and keywords, with prefix
 * matches ranked first.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search",
  emptyText = "No matches",
  noneLabel,
  disabled,
  invalid,
  className,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  const groups = useMemo(() => {
    const ordered = new Map<string, ComboboxOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      const bucket = ordered.get(key);
      if (bucket) bucket.push(option);
      else ordered.set(key, [option]);
    }
    return [...ordered.entries()];
  }, [options]);

  const choose = (next: string | null) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        disabled={disabled}
        className={cn(controlClass, "flex h-8 items-center gap-2 px-2.5 text-left", className)}
      >
        {selected?.icon}
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-faint")}>
          {selected ? selected.label : value === null && noneLabel ? noneLabel : placeholder}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-faint" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[max(var(--radix-popover-trigger-width),280px)] overflow-hidden rounded-md border border-line-strong bg-surface text-[13px] text-ink"
        >
          <Command
            filter={(_, search, keywords) =>
              rank((keywords ?? []).join(" ").toLowerCase(), search.trim().toLowerCase())
            }
          >
            <div className="flex items-center gap-2 border-b border-line px-2.5">
              <Search className="size-3.5 shrink-0 text-faint" />
              <Command.Input
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
              />
            </div>
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-2 py-6 text-center text-faint">{emptyText}</Command.Empty>
              {noneLabel ? (
                <Command.Item
                  value={NONE}
                  keywords={[noneLabel.toLowerCase()]}
                  onSelect={() => {
                    choose(null);
                  }}
                  className={cn(itemClass, "text-muted")}
                >
                  <span className="flex-1">{noneLabel}</span>
                  {value === null ? <Check className="size-3.5 text-accent" /> : null}
                </Command.Item>
              ) : null}
              {groups.map(([group, items]) => (
                <Command.Group
                  key={group || "\u0000"}
                  heading={group || undefined}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint"
                >
                  {items.map((option) => (
                    <Command.Item
                      key={option.value}
                      value={option.value}
                      keywords={[option.label, option.detail ?? "", ...(option.keywords ?? [])].map((term) =>
                        term.toLowerCase(),
                      )}
                      onSelect={() => {
                        choose(option.value);
                      }}
                      className={itemClass}
                    >
                      {option.icon}
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                        {option.detail ? <span className="ml-2 text-faint">{option.detail}</span> : null}
                      </span>
                      {option.value === value ? <Check className="size-3.5 shrink-0 text-accent" /> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
