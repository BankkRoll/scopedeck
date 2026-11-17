import type { Bounty, Report } from "@/ipc/reports";

export const REPORT_STATES = [
  "new",
  "pending-program-review",
  "triaged",
  "needs-more-info",
  "retesting",
  "resolved",
  "informative",
  "duplicate",
  "not-applicable",
  "spam",
] as const;

export const OPEN_STATES = new Set([
  "new",
  "pending-program-review",
  "triaged",
  "needs-more-info",
  "retesting",
]);

function decimal(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Bounty amounts are USD decimal strings; bonuses are reported separately from the award. */
export function bountyTotal(bounties: readonly Bounty[]): number {
  return bounties.reduce((sum, bounty) => sum + decimal(bounty.amount) + decimal(bounty.bonusAmount), 0);
}

export function reportMatches(report: Report, needle: string): boolean {
  const query = needle.trim().toLowerCase().replace(/^#/, "");
  if (!query) return true;
  return (
    report.id === query ||
    report.title.toLowerCase().includes(query) ||
    (report.program?.handle.toLowerCase().includes(query) ?? false) ||
    (report.weakness?.name.toLowerCase().includes(query) ?? false)
  );
}

export function activityLabel(kind: string): string {
  const trimmed = kind.replace(/^activity-/, "").replace(/-/g, " ");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
