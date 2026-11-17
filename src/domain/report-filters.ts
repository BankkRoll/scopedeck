/**
 * Reports page filtering: the persisted filter schema, the "needs your attention" rule,
 * sorting, and grouping reports into board columns.
 */
import { z } from "zod";
import type { Report } from "@/ipc/reports";
import { OPEN_STATES, bountyTotal } from "./reports";

/** Every filter on the reports page. Empty arrays and nulls mean "any". */
export const reportFiltersSchema = z.object({
  openOnly: z.boolean().default(true),
  /** Only reports waiting on the hacker; see {@link needsAttention}. */
  attention: z.boolean().default(false),
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
    filters.attention,
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

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Whether a report is waiting on the hacker: the program asked for more information, or the
 * program has replied since the hacker last did. Without any hacker activity the submission
 * itself counts as the hacker's last word.
 *
 * Only open reports qualify by reply order, since programs almost always have the last word
 * on a closed report and flagging every one would drown out the reports that need a response.
 */
export function needsAttention(report: Report): boolean {
  const state = report.state ?? "";
  if (state === "needs-more-info") return true;
  if (!OPEN_STATES.has(state)) return false;
  const program = time(report.lastProgramActivityAt);
  const reporter = time(report.lastReporterActivityAt ?? report.submittedAt ?? report.createdAt);
  return program !== null && (reporter === null || program > reporter);
}

/**
 * When the report started waiting on the hacker: the program's last activity, falling back to
 * the report's last activity. `null` when the report has no timestamps at all.
 */
export function waitingSince(report: Report): string | null {
  return report.lastProgramActivityAt ?? report.lastActivityAt ?? report.createdAt;
}

/** Sorts reports so the one that has waited longest on the hacker comes first; undated last. */
export function sortByWaiting(reports: readonly Report[]): Report[] {
  return reports.toSorted(
    (a, b) =>
      (time(waitingSince(a)) ?? Number.POSITIVE_INFINITY) -
        (time(waitingSince(b)) ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id),
  );
}

/** Whether a report passes every filter. */
export function reportPassesFilters(report: Report, filters: ReportFilters): boolean {
  const state = report.state ?? "";
  if (filters.openOnly && !OPEN_STATES.has(state)) return false;
  if (filters.attention && !needsAttention(report)) return false;
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

/** One column of the reports board. */
export interface BoardColumn {
  id: string;
  label: string;
  /** Report states shown in this column. */
  states: readonly string[];
}

/** The reports board, left to right in the order a report usually moves. */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { id: "new", label: "New", states: ["new"] },
  { id: "pending-program-review", label: "Pending review", states: ["pending-program-review"] },
  { id: "triaged", label: "Triaged", states: ["triaged"] },
  { id: "needs-more-info", label: "Needs more info", states: ["needs-more-info"] },
  { id: "retesting", label: "Retesting", states: ["retesting"] },
  { id: "resolved", label: "Resolved", states: ["resolved"] },
  { id: "closed", label: "Closed", states: ["informative", "duplicate", "not-applicable", "spam"] },
];

/** A board column with the reports it shows. */
export interface BoardGroup {
  column: BoardColumn;
  reports: Report[];
}

/**
 * Splits reports into {@link BOARD_COLUMNS}, keeping their order within each column. Reports in
 * a state the board does not know land in Closed so none silently disappear.
 */
export function groupIntoBoard(reports: readonly Report[]): BoardGroup[] {
  const groups = BOARD_COLUMNS.map((column): BoardGroup => ({ column, reports: [] }));
  const fallback = groups.at(-1);
  for (const report of reports) {
    const group = groups.find(({ column }) => column.states.includes(report.state ?? "")) ?? fallback;
    group?.reports.push(report);
  }
  return groups;
}
