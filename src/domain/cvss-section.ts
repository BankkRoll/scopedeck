import { formatVector, parseVector } from "./cvss";

const SECTION = /^## CVSS[ \t]*\n+`([^`\n]+)`[ \t]*\n?/m;

/**
 * The CVSS vector recorded in a report body's `## CVSS` section, normalised to CVSS 3.1, or
 * null when the body has none or it does not parse.
 *
 * The Hacker API takes only a severity rating, so the vector travels in the report text. Finding
 * import writes the same section, which keeps both paths compatible.
 *
 * @example extractCvssVector("## CVSS\n\n`CVSS:3.1/AV:N/...`")
 */
export function extractCvssVector(markdown: string): string | null {
  const raw = SECTION.exec(markdown)?.[1];
  if (!raw) return null;
  const metrics = parseVector(raw);
  return metrics ? formatVector(metrics) : null;
}

/**
 * Replaces the body's `## CVSS` section with `vector`, or appends one when there is none.
 *
 * @example upsertCvssSection("## Summary\n\nText", "CVSS:3.1/AV:N/...")
 */
export function upsertCvssSection(markdown: string, vector: string): string {
  const section = `## CVSS\n\n\`${vector}\`\n`;
  if (SECTION.test(markdown)) return markdown.replace(SECTION, section);
  const trimmed = markdown.trimEnd();
  return trimmed ? `${trimmed}\n\n${section}` : section;
}
