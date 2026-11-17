import { useId } from "react";
import type { Total } from "@/domain/earnings";
import { formatMoney } from "@/domain/format";

const HEIGHT = 160;
const GRID_STEPS = 4;

function niceCeiling(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Bars use theme tokens so both modes stay legible; the figure carries a summary and an
 * equivalent data table for screen readers.
 */
export function BarChart({ data, title }: { data: Total[]; title: string }) {
  const titleId = useId();
  const max = niceCeiling(Math.max(...data.map((datum) => datum.amount), 0));
  const best = data.reduce<Total | undefined>(
    (top, datum) => (!top || datum.amount > top.amount ? datum : top),
    undefined,
  );
  const summary =
    best && best.amount > 0
      ? `Highest: ${best.label}, ${formatMoney(best.amount)}.`
      : "No earnings in this period.";

  return (
    <figure aria-labelledby={titleId} className="flex flex-col gap-2">
      <figcaption id={titleId} className="text-[13px] font-medium text-faint">
        {title} <span className="sr-only">{summary}</span>
      </figcaption>
      <div className="flex gap-3" aria-hidden>
        <div
          className="flex flex-col justify-between py-0 text-right font-mono text-[13px] text-faint"
          style={{ height: HEIGHT }}
        >
          {Array.from({ length: GRID_STEPS + 1 }, (_, index) => (
            <span
              key={index}
              className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0"
            >
              {formatMoney((max / GRID_STEPS) * (GRID_STEPS - index))}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {Array.from({ length: GRID_STEPS + 1 }, (_, index) => (
              <div key={index} className="border-t border-line" />
            ))}
          </div>
          <div className="relative flex items-end gap-1.5" style={{ height: HEIGHT }}>
            {data.map((datum) => (
              <div
                key={datum.key}
                className="group relative flex h-full flex-1 items-end"
                title={`${datum.label}: ${formatMoney(datum.amount)}`}
              >
                <div
                  className="w-full rounded-t-[2px] bg-[var(--chart-bar)] transition-opacity group-hover:opacity-80"
                  style={{
                    height: `${max > 0 ? (datum.amount / max) * 100 : 0}%`,
                    minHeight: datum.amount > 0 ? 2 : 0,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {data.map((datum, index) => (
              <span key={datum.key} className="flex-1 text-center text-[13px] text-faint">
                {index % 2 === 0 ? datum.label.slice(0, 3) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Earned</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.key}>
              <th scope="row">{datum.label}</th>
              <td>{formatMoney(datum.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
