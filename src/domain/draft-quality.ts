/**
 * Heuristic quality score for a report draft.
 *
 * Responsibilities:
 * - Run a fixed list of weighted checks that mirror what triage teams look for.
 * - Return a 0–100 score plus per-check results with hints for anything that failed.
 *
 * The checks are deliberately simple text heuristics; they guide the writer, they do not
 * validate submission (see `composer-validation.ts` for that).
 */
import type { DraftContent } from "@/ipc/workspace";

/** Identifier of a draft quality check. */
export type DraftCheckId =
  | "specific-title"
  | "steps"
  | "proof-of-concept"
  | "impact"
  | "severity"
  | "asset"
  | "weakness"
  | "endpoint"
  | "no-placeholders";

/** The outcome of one quality check. */
export interface DraftCheck {
  id: DraftCheckId;
  label: string;
  passed: boolean;
  /** What to do to pass the check. Shown when it fails. */
  hint: string;
  /** Share of the total score this check contributes, out of 100. */
  weight: number;
}

/** The result of {@link draftQuality}. */
export interface DraftQuality {
  /** Weighted sum of passed checks, from 0 to 100. */
  score: number;
  checks: DraftCheck[];
}

/** Optional context that sharpens the checks. */
export interface DraftQualityContext {
  /** Name of the selected weakness; a title that only repeats it counts as generic. */
  weaknessName?: string;
}

/** Titles shorter than this rarely say where the issue is and what it allows. */
export const MIN_TITLE_LENGTH = 25;
/** Impact statements shorter than this rarely explain a consequence. */
export const MIN_IMPACT_LENGTH = 80;

const GENERIC_TITLE_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "on",
  "at",
  "of",
  "for",
  "to",
  "via",
  "with",
  "and",
  "or",
  "is",
  "was",
  "found",
  "vulnerability",
  "vulnerabilities",
  "vuln",
  "bug",
  "issue",
  "security",
  "critical",
  "high",
  "medium",
  "low",
  "possible",
  "potential",
  "website",
  "site",
  "application",
  "app",
  "xss",
  "cross",
  "scripting",
  "reflected",
  "stored",
  "dom",
  "idor",
  "ssrf",
  "csrf",
  "sqli",
  "sql",
  "injection",
  "rce",
  "remote",
  "code",
  "execution",
  "open",
  "redirect",
  "information",
  "disclosure",
  "auth",
  "authentication",
  "bypass",
  "account",
  "takeover",
  "request",
  "forgery",
  "server",
  "side",
  "business",
  "logic",
  "error",
]);

const STEPS_PATTERN = /^\s*(?:#{1,6}\s*|\*\*)?steps\b|steps to reproduce/im;
const NUMBERED_LIST_PATTERN = /^\s*1[.)]\s+\S/m;
const CODE_FENCE_PATTERN = /^\s*(?:```|~~~)/m;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>()]+/i;
const HTTP_REQUEST_PATTERN = /^\s*(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+/m;
const CURL_PATTERN = /\bcurl\s+\S/;
// A path with at least two segments, e.g. `/api/users` or `/v2/orders/{id}`. Requiring a
// preceding delimiter avoids matching "and/or" or dates like "1/2/2024".
const PATH_PATTERN = /(?:^|[\s`'"(])\/[A-Za-z0-9_.~-]+\/[A-Za-z0-9_.~{}:/-]*/m;
const PLACEHOLDER_PATTERN =
  /\bTODO\b|\bTBD\b|\bFIXME\b|lorem ipsum|\blorem\b|<\s*insert|\[\s*insert|\[\s*(?:describe|explain|paste|list|add)\b/i;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSpecificTitle(title: string, weaknessName: string | undefined): boolean {
  const trimmed = title.trim();
  if (trimmed.length < MIN_TITLE_LENGTH) return false;
  const generic = new Set([...GENERIC_TITLE_WORDS, ...words(weaknessName ?? "")]);
  return words(trimmed).filter((word) => !generic.has(word)).length >= 2;
}

/**
 * Scores a draft against heuristic report-quality checks.
 *
 * @param content - The draft being composed.
 * @param context - Optional extra signals, such as the selected weakness's name.
 * @returns A 0–100 score and the individual checks in display order.
 * @example
 * const { score, checks } = draftQuality(draft, { weaknessName: "Cross-site Scripting (XSS) - Stored" });
 * const todo = checks.filter((check) => !check.passed);
 */
export function draftQuality(content: DraftContent, context: DraftQualityContext = {}): DraftQuality {
  const body = content.vulnerabilityInformation;
  const impact = content.impact.trim();
  const everything = [content.title, body, content.impact].join("\n");

  const checks: DraftCheck[] = [
    {
      id: "specific-title",
      label: "Title is specific",
      passed: isSpecificTitle(content.title, context.weaknessName),
      hint: `Name the weakness, where it is and what it allows, in at least ${MIN_TITLE_LENGTH} characters.`,
      weight: 15,
    },
    {
      id: "steps",
      label: "Steps to reproduce",
      passed: STEPS_PATTERN.test(body) || NUMBERED_LIST_PATTERN.test(body),
      hint: 'Add a numbered list of steps, or a "Steps to reproduce" section.',
      weight: 15,
    },
    {
      id: "proof-of-concept",
      label: "Proof of concept",
      passed:
        CODE_FENCE_PATTERN.test(body) ||
        URL_PATTERN.test(body) ||
        HTTP_REQUEST_PATTERN.test(body) ||
        CURL_PATTERN.test(body),
      hint: "Include the payload, request or URL that demonstrates the issue, ideally in a code block.",
      weight: 15,
    },
    {
      id: "impact",
      label: "Impact explains the consequence",
      passed: impact.length >= MIN_IMPACT_LENGTH,
      hint: "Explain what an attacker gains and who is affected, in at least a couple of sentences.",
      weight: 15,
    },
    {
      id: "severity",
      label: "Severity set",
      passed: content.severityRating !== null,
      hint: "Choose a severity, or calculate one with CVSS.",
      weight: 5,
    },
    {
      id: "asset",
      label: "Asset set",
      passed: content.structuredScopeId !== null,
      hint: "Choose the in-scope asset the issue affects.",
      weight: 10,
    },
    {
      id: "weakness",
      label: "Weakness set",
      passed: content.weaknessId !== null,
      hint: "Choose the weakness type that best fits the issue.",
      weight: 5,
    },
    {
      id: "endpoint",
      label: "Affected URL or endpoint",
      passed:
        URL_PATTERN.test(body) ||
        HTTP_REQUEST_PATTERN.test(body) ||
        PATH_PATTERN.test(body) ||
        PATH_PATTERN.test(content.title),
      hint: "Mention the exact URL or API endpoint, such as POST /api/v2/users.",
      weight: 10,
    },
    {
      id: "no-placeholders",
      label: "No placeholder text",
      passed: !PLACEHOLDER_PATTERN.test(everything),
      hint: "Replace leftover template prompts, TODOs and filler text.",
      weight: 10,
    },
  ];

  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  return { score, checks };
}
