import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { controlClass } from "./field";

/** Props for {@link DatePicker}. */
export interface DatePickerProps {
  id?: string;
  /** Selected day as `YYYY-MM-DD`, or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function parse(value: string | null): { year: number; month: number } | null {
  const match = value ? /^(\d{4})-(\d{2})-\d{2}$/.exec(value) : null;
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null;
}

function display(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * A single-day picker with a month grid. Weeks start on Monday, and days are plain
 * `YYYY-MM-DD` strings so no time zone conversion happens.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Any date",
  invalid,
  className,
}: DatePickerProps) {
  const today = new Date();
  const todayIso = isoDay(today.getFullYear(), today.getMonth(), today.getDate());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(
    () => parse(value) ?? { year: today.getFullYear(), month: today.getMonth() },
  );

  const first = new Date(view.year, view.month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];

  const shift = (delta: number) => {
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setView(parse(value) ?? { year: today.getFullYear(), month: today.getMonth() });
        setOpen(next);
      }}
    >
      <div className={cn("relative", className)}>
        <Popover.Trigger
          id={id}
          aria-invalid={invalid}
          className={cn(controlClass, "flex h-8 items-center gap-2 px-2.5 text-left")}
        >
          <Calendar className="size-3.5 shrink-0 text-faint" />
          <span className={cn("flex-1 truncate", !value && "text-faint")}>
            {value ? display(value) : placeholder}
          </span>
        </Popover.Trigger>
        {value ? (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => {
              onChange(null);
            }}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm p-0.5 text-faint hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-64 rounded-md border border-line-strong bg-surface p-2 text-[13px] text-ink"
        >
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => {
                shift(-1);
              }}
              className="rounded-sm p-1 text-muted hover:bg-hover hover:text-ink"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="font-medium">
              {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => {
                shift(1);
              }}
              className="rounded-sm p-1 text-muted hover:bg-hover hover:text-ink"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center" role="grid">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className="py-1 text-[12px] text-faint">
                {weekday}
              </span>
            ))}
            {cells.map((day, index) => {
              if (day === null) return <span key={`blank-${String(index)}`} />;
              const iso = isoDay(view.year, view.month, day);
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  aria-pressed={selected}
                  aria-label={display(iso)}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "h-7 rounded-sm tabular-nums transition-colors",
                    selected ? "bg-accent text-accent-ink" : "hover:bg-hover",
                    !selected && iso === todayIso && "text-link",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
