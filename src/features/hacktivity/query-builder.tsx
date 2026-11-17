import { useId } from "react";
import type { SeverityRating } from "@/ipc/common";
import { hacktivitySortSchema, type HacktivitySort } from "@/ipc/hacktivity";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { humanize } from "@/domain/format";
import {
  ASSET_TYPES,
  filterProblems,
  queryStringFor,
  type BuilderState,
  type HacktivityFilters,
} from "@/domain/hacktivity-query";
import { cn } from "@/lib/cn";

const SEVERITIES: SeverityRating[] = ["critical", "high", "medium", "low", "none"];

const SORT_LABELS: Record<HacktivitySort, string> = {
  "-latest_disclosable_activity_at": "Latest activity",
  latest_disclosable_activity_at: "Oldest activity",
  "-disclosed_at": "Newest disclosures",
  disclosed_at: "Oldest disclosures",
  "-total_awarded_amount": "Highest bounty",
  total_awarded_amount: "Lowest bounty",
  "-votes": "Most votes",
  votes: "Fewest votes",
};

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-7 rounded-md border px-2 text-[13px] whitespace-nowrap transition-colors",
        pressed
          ? "border-ink bg-raised text-ink"
          : "border-line text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function numberOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

interface QueryBuilderProps {
  state: BuilderState;
  onChange: (state: BuilderState) => void;
}

export function QueryBuilder({ state, onChange }: QueryBuilderProps) {
  const ids = {
    raw: useId(),
    cwe: useId(),
    cve: useId(),
    program: useId(),
    reporter: useId(),
    min: useId(),
    max: useId(),
    from: useId(),
    to: useId(),
    collaboration: useId(),
    sort: useId(),
  };
  const filters = state.filters;
  const set = (patch: Partial<HacktivityFilters>) => {
    onChange({ ...state, filters: { ...filters, ...patch } });
  };
  const problems = filterProblems(filters);
  const problem = (field: keyof HacktivityFilters) =>
    problems.find((candidate) => candidate.field === field)?.message;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div role="radiogroup" aria-label="Query mode" className="flex rounded-md border border-line p-0.5">
          {(["builder", "raw"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={state.mode === mode}
              onClick={() => {
                onChange({
                  ...state,
                  mode,
                  raw: mode === "raw" && !state.raw ? queryStringFor(state) : state.raw,
                });
              }}
              className="h-6 rounded-sm px-2.5 text-[13px] text-muted aria-checked:bg-raised aria-checked:text-ink"
            >
              {mode === "builder" ? "Builder" : "Lucene"}
            </button>
          ))}
        </div>
        <label htmlFor={ids.sort} className="ml-auto text-[13px] text-faint">
          Sort
        </label>
        <Select
          id={ids.sort}
          className="w-48"
          value={state.sort}
          onChange={(event) => {
            const sort = hacktivitySortSchema.safeParse(event.target.value);
            if (sort.success) onChange({ ...state, sort: sort.data });
          }}
        >
          {hacktivitySortSchema.options.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </Select>
      </div>

      {state.mode === "raw" ? (
        <Field
          label="Lucene query"
          htmlFor={ids.raw}
          hint="Fields: severity_rating, asset_type, substate, cwe, cve_ids, reporter, team, total_awarded_amount, disclosed_at, has_collaboration, disclosed."
        >
          <Textarea
            id={ids.raw}
            value={state.raw}
            spellCheck={false}
            onChange={(event) => {
              onChange({ ...state, raw: event.target.value });
            }}
            className="min-h-20 font-mono"
          />
        </Field>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Severity">
            <span className="mr-1 w-24 text-[13px] text-faint">Severity</span>
            {SEVERITIES.map((severity) => (
              <Toggle
                key={severity}
                pressed={filters.severities.includes(severity)}
                onClick={() => {
                  set({ severities: toggle(filters.severities, severity) });
                }}
              >
                {humanize(severity)}
              </Toggle>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Asset type">
            <span className="mr-1 w-24 text-[13px] text-faint">Asset type</span>
            {ASSET_TYPES.map((assetType) => (
              <Toggle
                key={assetType}
                pressed={filters.assetTypes.includes(assetType)}
                onClick={() => {
                  set({ assetTypes: toggle(filters.assetTypes, assetType) });
                }}
              >
                {humanize(assetType.toLowerCase())}
              </Toggle>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="CWE" htmlFor={ids.cwe}>
              <Input
                id={ids.cwe}
                value={filters.cwe}
                placeholder="79 or a name"
                onChange={(event) => {
                  set({ cwe: event.target.value });
                }}
              />
            </Field>
            <Field label="CVE" htmlFor={ids.cve} error={problem("cve")}>
              <Input
                id={ids.cve}
                value={filters.cve}
                placeholder="CVE-2024-12345"
                onChange={(event) => {
                  set({ cve: event.target.value });
                }}
              />
            </Field>
            <Field label="Program handle" htmlFor={ids.program}>
              <Input
                id={ids.program}
                value={filters.program}
                onChange={(event) => {
                  set({ program: event.target.value });
                }}
              />
            </Field>
            <Field label="Reporter" htmlFor={ids.reporter}>
              <Input
                id={ids.reporter}
                value={filters.reporter}
                onChange={(event) => {
                  set({ reporter: event.target.value });
                }}
              />
            </Field>
            <Field label="Bounty from (USD)" htmlFor={ids.min}>
              <Input
                id={ids.min}
                inputMode="numeric"
                value={filters.minBounty ?? ""}
                onChange={(event) => {
                  set({ minBounty: numberOrNull(event.target.value) });
                }}
              />
            </Field>
            <Field label="Bounty to (USD)" htmlFor={ids.max} error={problem("maxBounty")}>
              <Input
                id={ids.max}
                inputMode="numeric"
                value={filters.maxBounty ?? ""}
                onChange={(event) => {
                  set({ maxBounty: numberOrNull(event.target.value) });
                }}
              />
            </Field>
            <Field label="Disclosed from" htmlFor={ids.from}>
              <Input
                id={ids.from}
                type="date"
                value={filters.disclosedFrom ?? ""}
                onChange={(event) => {
                  set({ disclosedFrom: event.target.value || null });
                }}
              />
            </Field>
            <Field label="Disclosed to" htmlFor={ids.to} error={problem("disclosedTo")}>
              <Input
                id={ids.to}
                type="date"
                value={filters.disclosedTo ?? ""}
                onChange={(event) => {
                  set({ disclosedTo: event.target.value || null });
                }}
              />
            </Field>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <label htmlFor={ids.collaboration} className="text-[13px] text-faint">
                Collaboration
              </label>
              <Select
                id={ids.collaboration}
                className="w-40"
                value={filters.collaboration}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "any" || value === "yes" || value === "no") set({ collaboration: value });
                }}
              >
                <option value="any">Any</option>
                <option value="yes">Collaborations only</option>
                <option value="no">Solo only</option>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input
                type="checkbox"
                checked={filters.disclosedOnly}
                onChange={(event) => {
                  set({ disclosedOnly: event.target.checked });
                }}
                className="size-3.5 accent-[var(--accent)]"
              />
              Disclosed reports only
            </label>
          </div>
        </>
      )}
      <p className="selectable truncate font-mono text-[13px] text-faint" aria-label="Compiled query">
        {queryStringFor(state) || "All hacktivity"}
      </p>
    </div>
  );
}
