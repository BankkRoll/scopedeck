/**
 * Derived views of one program for the program page: the hacker's own reports against it, its
 * disclosed Hacktivity query, report validity, and scope recency and CIA requirements.
 */
import type { StructuredScope } from "@/ipc/programs";
import type { Report } from "@/ipc/reports";
import { EMPTY_FILTERS, compileQuery } from "./hacktivity-query";

/**
 * Share of reports that were valid, between 0 and 1, or null when there are no reports to judge.
 *
 * @example validReportRate(4, 3) // 0.75
 */
export function validReportRate(total: number | null, valid: number | null): number | null {
  if (!total || total <= 0) return null;
  return Math.min(1, Math.max(0, (valid ?? 0) / total));
}

/**
 * A 0–1 ratio as a whole percentage.
 *
 * @example formatPercent(0.666) // "67%"
 */
export function formatPercent(ratio: number): string {
  return `${String(Math.round(ratio * 100))}%`;
}

function time(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** When a report was filed, falling back to its creation time for drafts the API never submitted. */
export function reportFiledAt(report: Report): string | null {
  return report.submittedAt ?? report.createdAt;
}

/** The cached reports filed against one program, newest first. Handles compare case-insensitively. */
export function reportsForProgram(reports: readonly Report[], handle: string): Report[] {
  const key = handle.toLowerCase();
  return reports
    .filter((report) => report.program?.handle.toLowerCase() === key)
    .toSorted((a, b) => time(reportFiledAt(b)) - time(reportFiledAt(a)));
}

/**
 * The Hacktivity query for a program's disclosed reports.
 *
 * @example programHacktivityQuery("acme") // "disclosed:true AND team:acme"
 */
export function programHacktivityQuery(handle: string): string {
  return compileQuery({ ...EMPTY_FILTERS, program: handle });
}

/** Whether an asset was last added or edited, and when. */
export interface ScopeTimestamp {
  kind: "Added" | "Updated";
  at: string;
}

// NOTE: The API stamps `updatedAt` a few seconds after `createdAt` on brand-new assets, so edits
// within this window still read as "Added".
const EDIT_THRESHOLD_MS = 60_000;

/** The most telling timestamp for an asset: its last edit if it was edited, else when it was added. */
export function scopeTimestamp(scope: StructuredScope): ScopeTimestamp | null {
  const created = time(scope.createdAt);
  const updated = time(scope.updatedAt);
  if (scope.updatedAt && updated - created > EDIT_THRESHOLD_MS) {
    return { kind: "Updated", at: scope.updatedAt };
  }
  if (scope.createdAt) return { kind: "Added", at: scope.createdAt };
  return scope.updatedAt ? { kind: "Updated", at: scope.updatedAt } : null;
}

/** Assets ordered by their latest add or edit, newest first; undated assets go last. */
export function sortScopesNewestFirst<T extends StructuredScope>(scopes: readonly T[]): T[] {
  const latest = (scope: T) => Math.max(time(scope.createdAt), time(scope.updatedAt));
  return scopes.toSorted(
    (a, b) => latest(b) - latest(a) || a.assetIdentifier.localeCompare(b.assetIdentifier),
  );
}

/** One CVSS environmental requirement an asset declares. */
export interface CiaRequirement {
  /** Single-letter CVSS metric key: C, I or A. */
  key: "C" | "I" | "A";
  label: "Confidentiality" | "Integrity" | "Availability";
  value: string;
}

/** The confidentiality, integrity and availability requirements an asset sets, skipping unset ones. */
export function ciaRequirements(scope: StructuredScope): CiaRequirement[] {
  const all: [CiaRequirement["key"], CiaRequirement["label"], string | null][] = [
    ["C", "Confidentiality", scope.confidentialityRequirement],
    ["I", "Integrity", scope.integrityRequirement],
    ["A", "Availability", scope.availabilityRequirement],
  ];
  return all.flatMap(([key, label, value]) => (value ? [{ key, label, value }] : []));
}
