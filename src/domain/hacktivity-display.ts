/**
 * Display helpers for Hacktivity items: turning HackerOne's activity class names into readable
 * labels and describing how long a report took to go public.
 */
import { formatDuration } from "./format";

const ACTION_LABELS: Record<string, string> = {
  ReportBecamePublic: "Disclosed",
  AgreedOnGoingPublic: "Disclosure agreed",
  ManuallyDisclosed: "Disclosed",
  BountyAwarded: "Bounty awarded",
  SwagAwarded: "Swag awarded",
  BugResolved: "Resolved",
  BugTriaged: "Triaged",
  BugInformative: "Informative",
  BugDuplicate: "Duplicate",
  BugNotApplicable: "Not applicable",
  CveIdAdded: "CVE assigned",
  ReportSeverityUpdated: "Severity updated",
  ReportTitleUpdated: "Title updated",
};

/**
 * A readable label for a Hacktivity `latestDisclosableAction`, which the API returns as a Ruby
 * class name. Unknown actions fall back to the last segment split into words.
 *
 * @param action - Raw action such as `Activities::BountyAwarded`.
 * @returns The label, or an empty string when there is no action.
 * @example disclosableActionLabel("Activities::ReportBecamePublic") // "Disclosed"
 * @example disclosableActionLabel("Activities::ExternalUserJoined") // "External user joined"
 */
export function disclosableActionLabel(action: string | null | undefined): string {
  const segment = action?.split("::").at(-1)?.trim();
  if (!segment) return "";
  const known = ACTION_LABELS[segment];
  if (known) return known;
  const words = segment
    .replace(/[-_]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words
    .map((word, index) => {
      // Keep acronyms such as "CVE" or "IDOR" as written.
      if (word.length > 1 && word === word.toUpperCase()) return word;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

/**
 * How long a report took from submission to public disclosure, such as "12 days".
 *
 * @param submittedAt - ISO timestamp the report was submitted.
 * @param disclosedAt - ISO timestamp the report was disclosed.
 * @returns The span, or an empty string when either side is missing or out of order.
 * @example timeToDisclose("2026-01-01T00:00:00Z", "2026-01-13T00:00:00Z") // "12 days"
 */
export function timeToDisclose(
  submittedAt: string | null | undefined,
  disclosedAt: string | null | undefined,
): string {
  return formatDuration(submittedAt, disclosedAt);
}
