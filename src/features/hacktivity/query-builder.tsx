import { useId } from "react";
import type { SeverityRating } from "@/ipc/common";
import { ChipGroup, DateRange, FilterSection, NumberRange, ToggleFilter } from "@/components/filters";
import { SeverityLabel } from "@/components/status";
import { Field, Input, Textarea } from "@/components/ui/field";
import { assetTypeLabel } from "@/domain/format";
import {
  ASSET_TYPES,
  filterProblems,
  queryStringFor,
  type BuilderState,
  type HacktivityFilters,
} from "@/domain/hacktivity-query";

const SEVERITIES: SeverityRating[] = ["critical", "high", "medium", "low", "none"];

const COLLABORATION = [
  { value: "yes", label: "Collaborations only" },
  { value: "no", label: "Solo only" },
] as const;

interface QueryBuilderProps {
  state: BuilderState;
  onChange: (state: BuilderState) => void;
}

/** The Hacktivity search fields, laid out as filter-sheet sections. */
export function QueryBuilder({ state, onChange }: QueryBuilderProps) {
  const ids = { raw: useId(), cwe: useId(), cve: useId(), program: useId(), reporter: useId() };
  const filters = state.filters;
  const set = (patch: Partial<HacktivityFilters>) => {
    onChange({ ...state, filters: { ...filters, ...patch } });
  };
  const problems = filterProblems(filters);
  const problem = (field: keyof HacktivityFilters) =>
    problems.find((candidate) => candidate.field === field)?.message;

  return (
    <>
      <FilterSection title="Query mode" description="Use the builder, or write a Lucene query by hand.">
        <div
          role="radiogroup"
          aria-label="Query mode"
          className="flex w-fit rounded-md border border-line p-0.5"
        >
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
              className="h-7 rounded-[5px] px-3 text-[13px] text-muted aria-checked:bg-raised aria-checked:text-ink"
            >
              {mode === "builder" ? "Builder" : "Lucene"}
            </button>
          ))}
        </div>
      </FilterSection>

      {state.mode === "raw" ? (
        <FilterSection title="Lucene query">
          <Field
            label="Query"
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
              className="min-h-32 font-mono"
            />
          </Field>
        </FilterSection>
      ) : (
        <>
          <FilterSection title="Disclosure">
            <ToggleFilter
              label="Disclosed reports only"
              description="Include undisclosed activity when off."
              checked={filters.disclosedOnly}
              onChange={(disclosedOnly) => {
                set({ disclosedOnly });
              }}
            />
          </FilterSection>
          <FilterSection
            title="Severity"
            onClear={
              filters.severities.length
                ? () => {
                    set({ severities: [] });
                  }
                : undefined
            }
          >
            <ChipGroup
              label="Severity"
              value={filters.severities}
              onChange={(severities) => {
                set({ severities });
              }}
              options={SEVERITIES.map((severity) => ({
                value: severity,
                label: <SeverityLabel rating={severity} />,
              }))}
            />
          </FilterSection>
          <FilterSection
            title="Asset type"
            onClear={
              filters.assetTypes.length
                ? () => {
                    set({ assetTypes: [] });
                  }
                : undefined
            }
          >
            <ChipGroup
              label="Asset type"
              value={filters.assetTypes}
              onChange={(assetTypes) => {
                set({ assetTypes });
              }}
              options={ASSET_TYPES.map((assetType) => ({
                value: assetType,
                label: assetTypeLabel(assetType),
              }))}
            />
          </FilterSection>
          <FilterSection title="Weakness and CVE">
            <div className="grid grid-cols-2 gap-3">
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
            </div>
          </FilterSection>
          <FilterSection title="Program and reporter" description="Separate several values with commas.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Program handle" htmlFor={ids.program}>
                <Input
                  id={ids.program}
                  value={filters.program}
                  placeholder="security"
                  onChange={(event) => {
                    set({ program: event.target.value });
                  }}
                />
              </Field>
              <Field label="Reporter" htmlFor={ids.reporter}>
                <Input
                  id={ids.reporter}
                  value={filters.reporter}
                  placeholder="username"
                  onChange={(event) => {
                    set({ reporter: event.target.value });
                  }}
                />
              </Field>
            </div>
          </FilterSection>
          <FilterSection
            title="Bounty awarded"
            onClear={
              filters.minBounty !== null || filters.maxBounty !== null
                ? () => {
                    set({ minBounty: null, maxBounty: null });
                  }
                : undefined
            }
          >
            <NumberRange
              label="Bounty"
              prefix="$"
              min={filters.minBounty}
              max={filters.maxBounty}
              onChange={({ min, max }) => {
                set({ minBounty: min, maxBounty: max });
              }}
            />
          </FilterSection>
          <FilterSection
            title="Disclosed between"
            onClear={
              filters.disclosedFrom !== null || filters.disclosedTo !== null
                ? () => {
                    set({ disclosedFrom: null, disclosedTo: null });
                  }
                : undefined
            }
          >
            <DateRange
              label="Disclosed between"
              from={filters.disclosedFrom}
              to={filters.disclosedTo}
              onChange={({ from, to }) => {
                set({ disclosedFrom: from, disclosedTo: to });
              }}
            />
          </FilterSection>
          <FilterSection title="Collaboration">
            <ChipGroup
              label="Collaboration"
              value={filters.collaboration === "any" ? [] : [filters.collaboration]}
              onChange={(values) => {
                set({ collaboration: values.at(-1) ?? "any" });
              }}
              options={COLLABORATION}
            />
          </FilterSection>
        </>
      )}
    </>
  );
}
