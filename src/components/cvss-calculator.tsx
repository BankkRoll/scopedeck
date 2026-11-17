import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { SeverityRating } from "@/ipc/common";
import { cn } from "@/lib/cn";
import {
  CVSS_METRICS,
  CVSS_METRIC_ORDER,
  baseScore,
  formatVector,
  parseVector,
  severityFor,
  type CvssMetricKey,
  type CvssMetrics,
} from "@/domain/cvss";
import { Input } from "@/components/ui/field";

/** Props for {@link CvssCalculator}. */
export interface CvssCalculatorProps {
  /** The current CVSS vector, or `null` when none has been chosen. Invalid vectors are treated as `null`. */
  value: string | null;
  /** Called with a complete v3.1 vector whenever every base metric has a value. */
  onChange: (vector: string, score: number, severity: SeverityRating) => void;
}

type Selection = Partial<CvssMetrics>;

const SEVERITY_DOT: Record<SeverityRating, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
  none: "bg-sev-none",
};

const SEVERITY_LABEL: Record<SeverityRating, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

function complete(selection: Selection): CvssMetrics | null {
  const { AV, AC, PR, UI, S, C, I, A } = selection;
  return AV && AC && PR && UI && S && C && I && A ? { AV, AC, PR, UI, S, C, I, A } : null;
}

function partialVector(selection: Selection): string {
  return ["CVSS:3.1", ...CVSS_METRIC_ORDER.map((key) => `${key}:${selection[key] ?? "_"}`)].join("/");
}

/**
 * A compact CVSS v3.1 base score calculator for a narrow sidebar. Each metric is a radio group
 * of segmented buttons with arrow-key navigation; the live vector, score and severity update as
 * metrics are chosen. A vector can also be pasted into the input at the bottom.
 *
 * @example
 * <CvssCalculator value={draft.cvss} onChange={(vector, score, severity) => save({ vector, severity })} />
 */
export function CvssCalculator({ value, onChange }: CvssCalculatorProps) {
  const [selection, setSelection] = useState<Selection>(() => parseVector(value ?? "") ?? {});
  const [syncedValue, setSyncedValue] = useState(value);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const pasteId = useId();
  const pasteErrorId = useId();

  // Adopt a new `value` from the parent during render (React's "adjusting state when a prop
  // changes" pattern), but not when it is just the echo of our own last change.
  if (value !== syncedValue) {
    setSyncedValue(value);
    const parsed = parseVector(value ?? "");
    const current = complete(selection);
    if (parsed && (!current || formatVector(current) !== formatVector(parsed))) setSelection(parsed);
    else if (!parsed && value === null) setSelection({});
  }

  const apply = (next: Selection) => {
    setSelection(next);
    const metrics = complete(next);
    if (!metrics) return;
    const vector = formatVector(metrics);
    const score = baseScore(metrics);
    setSyncedValue(vector);
    onChange(vector, score, severityFor(score));
  };

  const commitPaste = (text: string): boolean => {
    const parsed = parseVector(text);
    if (!parsed) return false;
    setPasted("");
    setPasteError(false);
    apply(parsed);
    return true;
  };

  const metrics = complete(selection);
  const score = metrics ? baseScore(metrics) : null;
  const severity = score === null ? null : severityFor(score);
  const vector = metrics ? formatVector(metrics) : partialVector(selection);
  const remaining = CVSS_METRIC_ORDER.filter((key) => selection[key] === undefined).length;

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface p-2.5">
        <div className="flex items-baseline justify-between gap-2" aria-live="polite">
          {score !== null && severity !== null ? (
            <>
              <span className="text-[20px] leading-none font-semibold text-ink tabular-nums">
                {score.toFixed(1)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-ink">
                <span className={cn("size-2 rounded-[2px]", SEVERITY_DOT[severity])} aria-hidden />
                {SEVERITY_LABEL[severity]}
              </span>
            </>
          ) : (
            <span className="text-faint">
              Choose {remaining} more {remaining === 1 ? "metric" : "metrics"} to score
            </span>
          )}
        </div>
        <output
          aria-label="CVSS vector"
          className={cn("font-mono text-[13px] break-all select-text", metrics ? "text-muted" : "text-faint")}
        >
          {vector}
        </output>
      </div>

      {CVSS_METRIC_ORDER.map((key) => (
        <MetricGroup
          key={key}
          metric={key}
          selected={selection[key]}
          onSelect={(next) => {
            apply({ ...selection, [key]: next });
          }}
        />
      ))}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={pasteId} className="font-medium text-muted">
          Paste a vector
        </label>
        <Input
          id={pasteId}
          value={pasted}
          placeholder="CVSS:3.1/AV:N/AC:L/…"
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
          aria-invalid={pasteError || undefined}
          aria-describedby={pasteError ? pasteErrorId : undefined}
          onChange={(event) => {
            const text = event.target.value;
            setPasted(text);
            setPasteError(false);
            commitPaste(text);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (pasted.trim() && !commitPaste(pasted)) setPasteError(true);
          }}
          onBlur={() => {
            if (pasted.trim() && !commitPaste(pasted)) setPasteError(true);
          }}
        />
        {pasteError ? (
          <p id={pasteErrorId} className="text-danger">
            Not a valid CVSS 3.0 or 3.1 vector.
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface MetricGroupProps<K extends CvssMetricKey> {
  metric: K;
  selected: CvssMetrics[K] | undefined;
  onSelect: (value: CvssMetrics[K]) => void;
}

function MetricGroup<K extends CvssMetricKey>({ metric, selected, onSelect }: MetricGroupProps<K>) {
  const definition = CVSS_METRICS[metric];
  const labelId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const options = definition.values;
  const selectedIndex = options.findIndex((option) => option.value === selected);
  // Roving tabindex: the checked radio is the tab stop, or the first one when none is checked.
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    let next: number | null = null;
    if (step !== 0) next = (index + step + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    if (next === null) return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onSelect(option.value);
    buttons.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="font-medium text-muted" title={definition.description}>
        {definition.label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex rounded-md border border-line bg-raised p-0.5"
      >
        {options.map((option, index) => {
          const checked = option.value === selected;
          return (
            <button
              key={option.value}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === tabStop ? 0 : -1}
              title={option.description}
              onClick={() => {
                onSelect(option.value);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
              className={cn(
                "h-7 min-w-0 flex-1 cursor-default truncate rounded-[5px] px-1.5 text-[13px] transition-colors duration-100 select-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-focus",
                checked ? "bg-accent text-accent-ink" : "text-muted hover:bg-hover hover:text-ink",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
