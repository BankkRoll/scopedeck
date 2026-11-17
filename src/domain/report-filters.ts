import { z } from "zod";
import type { Report } from "@/ipc/reports";
import { OPEN_STATES, bountyTotal } from "./reports";

/** Every filter on the reports page. Empty arrays and nulls mean "any". */
export const reportFiltersSchema = z.object({
  openOnly: z.boolean().default(true),
  states: z.array(z.string()).default([]),
  severities: z.array(z.string()).default([]),
  programs: z.array(z.string()).default([]),
  bountyMin: z.number().nullable().default(null),
  bountyMax: z.number().nullable().default(null),
  submittedFrom: z.string().nullable().default(null),
  submittedTo: z.string().nullable().default(null),
});

/** Every filter on the reports page. */
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** The default: open reports only, which is what most visits to the inbox are for. */
export const DEFAULT_REPORT_FILTERS: ReportFilters = reportFiltersSchema.parse({});

/** Filters that keep every report, used by "Reset all". */
export const NO_REPORT_FILTERS: ReportFilters = { ...DEFAULT_REPORT_FILTERS, openOnly: false };

/** How many independent filters are narrowing the list, for the toolbar badge. */
export function activeReportFilterCount(filters: ReportFilters): number {
  return [
    filters.openOnly,
    filters.states.length > 0,
    filters.severities.length > 0,
    filters.programs.length > 0,
    filters.bountyMin !== null || filters.bountyMax !== null,
    filters.submittedFrom !== null || filters.submittedTo !== null,
  ].filter(Boolean).length;
}

/** The report's severity rating in lower case, or `"unrated"`. */
export function severityKey(report: Report): string {
  return report.severity?.rating?.toLowerCase() ?? "unrated";
}

/** Whether a report passes every filter. */
export function reportPassesFilters(report: Report, filters: ReportFilters): boolean {
  const state = report.state ?? "";
  if (filters.openOnly && !OPEN_STATES.has(state)) return false;
  if (filters.states.length && !filters.states.includes(state)) return false;
  if (filters.severities.length && !filters.severities.includes(severityKey(report))) return false;
  if (filters.programs.length && !filters.programs.includes(report.program?.handle ?? "")) return false;
  const bounty = bountyTotal(report.bounties);
  if (filters.bountyMin !== null && bounty < filters.bountyMin) return false;
  if (filters.bountyMax !== null && bounty > filters.bountyMax) return false;
  const submitted = (report.submittedAt ?? report.createdAt)?.slice(0, 10) ?? null;
  if (filters.submittedFrom && (!submitted || submitted < filters.submittedFrom)) return false;
  if (filters.submittedTo && (!submitted || submitted > filters.submittedTo)) return false;
  return true;
}

const SEVERITY_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, none: 1 };

const compare: Record<string, (a: Report, b: Report) => number> = {
  activity: (a, b) =>
    (a.lastActivityAt ?? a.createdAt ?? "").localeCompare(b.lastActivityAt ?? b.createdAt ?? ""),
  submitted: (a, b) => (a.submittedAt ?? a.createdAt ?? "").localeCompare(b.submittedAt ?? b.createdAt ?? ""),
  severity: (a, b) => (SEVERITY_RANK[severityKey(a)] ?? 0) - (SEVERITY_RANK[severityKey(b)] ?? 0),
  bounty: (a, b) => bountyTotal(a.bounties) - bountyTotal(b.bounties),
  title: (a, b) => a.title.localeCompare(b.title),
  id: (a, b) => Number(a.id) - Number(b.id),
};

/** Sorts reports by one of the page's sort keys. Unknown keys fall back to last activity. */
export function sortReports(reports: readonly Report[], id: string, desc: boolean): Report[] {
  const by = compare[id] ?? compare.activity;
  if (!by) return [...reports];
  const direction = desc ? -1 : 1;
  return reports.toSorted((a, b) => direction * by(a, b));
}
