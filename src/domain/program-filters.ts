import { z } from "zod";
import type { ProgramRow } from "@/ipc/programs";

const PERKS = [
  "fastPayments",
  "goldStandardSafeHarbor",
  "openScope",
  "allowsBountySplitting",
  "triageActive",
] as const;

/** Program attributes that can be required by the "Perks" filter. */
export type ProgramPerk = (typeof PERKS)[number];

/** Display names for {@link ProgramPerk}. */
export const PERK_LABELS: Record<ProgramPerk, string> = {
  fastPayments: "Fast payments",
  goldStandardSafeHarbor: "Gold standard safe harbor",
  openScope: "Open scope",
  allowsBountySplitting: "Bounty splitting",
  triageActive: "Managed triage",
};

/** Every filter on the programs page. Empty arrays and nulls mean "any". */
export const programFiltersSchema = z.object({
  types: z.array(z.enum(["bounty", "vdp"])).default([]),
  submission: z.array(z.string()).default([]),
  visibility: z.array(z.string()).default([]),
  perks: z.array(z.enum(PERKS)).default([]),
  reported: z.enum(["any", "yes", "no"]).default("any"),
  pinnedOnly: z.boolean().default(false),
  earnedMin: z.number().nullable().default(null),
  earnedMax: z.number().nullable().default(null),
  launchedFrom: z.string().nullable().default(null),
  launchedTo: z.string().nullable().default(null),
});

/** Every filter on the programs page. */
export type ProgramFilters = z.infer<typeof programFiltersSchema>;

/** Filters that keep every program. */
export const EMPTY_PROGRAM_FILTERS: ProgramFilters = programFiltersSchema.parse({});

/** How many independent filters are narrowing the list, for the toolbar badge. */
export function activeProgramFilterCount(filters: ProgramFilters): number {
  return [
    filters.types.length > 0,
    filters.submission.length > 0,
    filters.visibility.length > 0,
    filters.perks.length > 0,
    filters.reported !== "any",
    filters.pinnedOnly,
    filters.earnedMin !== null || filters.earnedMax !== null,
    filters.launchedFrom !== null || filters.launchedTo !== null,
  ].filter(Boolean).length;
}

/**
 * Whether a program passes every filter.
 *
 * @example
 * programMatches(row, { ...EMPTY_PROGRAM_FILTERS, types: ["bounty"] })
 */
export function programMatches(row: ProgramRow, filters: ProgramFilters): boolean {
  const type = row.offersBounties ? "bounty" : "vdp";
  if (filters.types.length && !filters.types.includes(type)) return false;
  if (filters.submission.length && !filters.submission.includes(row.submissionState ?? "")) return false;
  if (filters.visibility.length && !filters.visibility.includes(row.state ?? "")) return false;
  if (filters.perks.some((perk) => row[perk] !== true)) return false;
  const reported = (row.numberOfReportsForUser ?? 0) > 0;
  if (filters.reported === "yes" && !reported) return false;
  if (filters.reported === "no" && reported) return false;
  if (filters.pinnedOnly && !row.pinned) return false;
  const earned = row.bountyEarnedForUser ?? 0;
  if (filters.earnedMin !== null && earned < filters.earnedMin) return false;
  if (filters.earnedMax !== null && earned > filters.earnedMax) return false;
  const launched = row.startedAcceptingAt?.slice(0, 10) ?? null;
  if (filters.launchedFrom && (!launched || launched < filters.launchedFrom)) return false;
  if (filters.launchedTo && (!launched || launched > filters.launchedTo)) return false;
  return true;
}

/** Sort keys offered on the programs page. `default` keeps the API's order. */
export type ProgramSortId = "default" | "name" | "earned" | "reports" | "launched";

const compare: Record<ProgramSortId, (a: ProgramRow, b: ProgramRow) => number> = {
  default: () => 0,
  name: (a, b) => a.name.localeCompare(b.name),
  earned: (a, b) => (a.bountyEarnedForUser ?? 0) - (b.bountyEarnedForUser ?? 0),
  reports: (a, b) => (a.numberOfReportsForUser ?? 0) - (b.numberOfReportsForUser ?? 0),
  launched: (a, b) => (a.startedAcceptingAt ?? "").localeCompare(b.startedAcceptingAt ?? ""),
};

/**
 * Sorts programs with pinned ones always first. Ties keep their incoming (API) order because
 * `Array.prototype.sort` is stable.
 */
export function sortPrograms(rows: readonly ProgramRow[], id: string, desc: boolean): ProgramRow[] {
  const by = id in compare ? compare[id as ProgramSortId] : compare.default;
  const direction = desc ? -1 : 1;
  return rows.toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || direction * by(a, b));
}
