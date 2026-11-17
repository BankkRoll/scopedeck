import { X } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";
import { DatePicker } from "./ui/date-picker";
import { Input } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { Switch } from "./ui/switch";

/** Props for {@link FilterSheet}. */
export interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Number of rows the current filters keep, shown in the footer. */
  resultCount?: number;
  activeCount: number;
  onReset: () => void;
  /** When set, the sheet edits a draft and the primary button applies it, for filters that trigger a network search. */
  onApply?: () => void;
  applyDisabled?: boolean;
  /** Rendered above the footer actions, for example a preview of the compiled query. */
  summary?: ReactNode;
  children: ReactNode;
}

/**
 * The right-hand filter panel every data page uses. Local filters apply live and the primary
 * button just closes the sheet; with `onApply`, edits stay a draft until applied.
 */
export function FilterSheet({
  open,
  onOpenChange,
  resultCount,
  activeCount,
  onReset,
  onApply,
  applyDisabled,
  summary,
  children,
}: FilterSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description={activeCount ? `${activeCount} active` : "No filters applied"}
      footer={
        <>
          <Button variant="ghost" onClick={onReset} disabled={activeCount === 0}>
            Reset all
          </Button>
          <span className="ml-auto text-[13px] text-faint">
            {resultCount === undefined ? null : `${resultCount.toLocaleString()} results`}
          </span>
          <Button
            variant="primary"
            disabled={applyDisabled}
            onClick={() => {
              onApply?.();
              onOpenChange(false);
            }}
          >
            {onApply ? "Apply" : "Done"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col divide-y divide-line">{children}</div>
      {summary ? <div className="border-t border-line px-5 py-3">{summary}</div> : null}
    </Sheet>
  );
}

/** A titled group inside a {@link FilterSheet}. */
export function FilterSection({
  title,
  description,
  onClear,
  children,
}: {
  title: string;
  description?: string;
  /** Shown as a "Clear" link when the section has a value. */
  onClear?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-medium text-ink">{title}</h3>
          {description ? <p className="mt-0.5 text-[12px] text-faint">{description}</p> : null}
        </div>
        {onClear ? (
          <button type="button" onClick={onClear} className="text-[12px] text-link hover:underline">
            Clear
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** One choice in a {@link ChipGroup}. */
export interface ChipOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Optional count shown after the label, such as how many rows have this value. */
  count?: number;
}

/** Multi-select toggle chips. An empty selection means "any". */
export function ChipGroup<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChipOption<V>[];
  value: readonly V[];
  onChange: (value: V[]) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const pressed = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              onChange(pressed ? value.filter((item) => item !== option.value) : [...value, option.value]);
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[13px] whitespace-nowrap transition-colors",
              pressed
                ? "border-accent/60 bg-accent/10 text-ink"
                : "border-line text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {option.label}
            {option.count === undefined ? null : (
              <span className="font-mono text-[11px] text-faint tabular-nums">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled on/off filter. */
export function ToggleFilter({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="flex flex-col">
        <span className="text-[13px] text-ink">{label}</span>
        {description ? <span className="text-[12px] text-faint">{description}</span> : null}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

function numberOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** A pair of optional numeric bounds. */
export function NumberRange({
  label,
  min,
  max,
  onChange,
  prefix,
}: {
  label: string;
  min: number | null;
  max: number | null;
  onChange: (range: { min: number | null; max: number | null }) => void;
  prefix?: string;
}) {
  const invalid = min !== null && max !== null && min > max;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-2">
        {(["min", "max"] as const).map((bound) => (
          <div key={bound} className="relative">
            {prefix ? (
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-faint">
                {prefix}
              </span>
            ) : null}
            <Input
              aria-label={`${label} ${bound === "min" ? "from" : "to"}`}
              inputMode="numeric"
              placeholder={bound === "min" ? "From" : "To"}
              value={(bound === "min" ? min : max) ?? ""}
              aria-invalid={bound === "max" && invalid}
              onChange={(event) => {
                const next = numberOrNull(event.target.value);
                onChange(bound === "min" ? { min: next, max } : { min, max: next });
              }}
              className={prefix ? "pl-6" : undefined}
            />
          </div>
        ))}
      </div>
      {invalid ? <p className="text-[12px] text-danger">The upper bound is below the lower bound.</p> : null}
    </div>
  );
}

/** A pair of optional `YYYY-MM-DD` bounds. */
export function DateRange({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
}) {
  const invalid = from !== null && to !== null && from > to;
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <div className="grid grid-cols-2 gap-2">
        <DatePicker
          value={from}
          placeholder="From"
          onChange={(next) => {
            onChange({ from: next, to });
          }}
        />
        <DatePicker
          value={to}
          placeholder="To"
          invalid={invalid}
          onChange={(next) => {
            onChange({ from, to: next });
          }}
        />
      </div>
      {invalid ? <p className="text-[12px] text-danger">The end date is before the start date.</p> : null}
    </div>
  );
}

/** One applied filter, shown as a removable chip under the toolbar. */
export interface ActiveFilter {
  key: string;
  label: ReactNode;
  onRemove: () => void;
}

/** The row of applied filters under a page toolbar. Renders nothing when no filter is active. */
export function ActiveFilters({ filters, onClearAll }: { filters: ActiveFilter[]; onClearAll: () => void }) {
  if (filters.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-5 py-2">
      {filters.map((filter) => (
        <span
          key={filter.key}
          className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-raised pr-0.5 pl-2 text-[12px] text-muted"
        >
          {filter.label}
          <button
            type="button"
            aria-label={`Remove filter ${typeof filter.label === "string" ? filter.label : filter.key}`}
            onClick={filter.onRemove}
            className="grid size-5 place-items-center rounded-sm text-faint hover:bg-hover hover:text-ink"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="ml-1 text-[12px] text-link hover:underline">
        Clear all
      </button>
    </div>
  );
}
