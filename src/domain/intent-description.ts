import type { StructuredScope, Weakness } from "@/ipc/programs";
import type { DraftContent } from "@/ipc/workspace";

/**
 * Report intents accept a single free-text description, so the structured composer fields are
 * folded into markdown sections the Report Assistant can read.
 */
export function intentDescription(
  draft: DraftContent,
  scope: StructuredScope | undefined,
  weakness: Weakness | undefined,
): string {
  const facts = [
    scope ? `- Asset: \`${scope.assetIdentifier}\` (${scope.assetType})` : null,
    weakness
      ? `- Weakness: ${weakness.name}${weakness.externalId ? ` (${weakness.externalId.toUpperCase()})` : ""}`
      : null,
    draft.severityRating ? `- Severity: ${draft.severityRating}` : null,
  ].filter((line): line is string => line !== null);

  return [
    `# ${draft.title.trim()}`,
    facts.length > 0 ? facts.join("\n") : null,
    `## Vulnerability information\n\n${draft.vulnerabilityInformation.trim()}`,
    `## Impact\n\n${draft.impact.trim()}`,
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");
}
