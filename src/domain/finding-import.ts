import { z } from "zod";
import { severityRatingSchema, type SeverityRating } from "@/ipc/common";
import type { StructuredScope, Weakness } from "@/ipc/programs";
import type { DraftContent } from "@/ipc/workspace";
import { matchAsset } from "./scope-eligibility";

const text = z.string().trim().min(1);

const weaknessInput = z.union([
  text,
  z.number().int().positive(),
  z.object({
    cwe: z.union([text, z.number().int().positive()]).optional(),
    name: text.optional(),
  }),
]);

const severityInput = z.union([
  severityRatingSchema,
  z.object({ rating: severityRatingSchema, cvss: text.optional() }),
]);

export const findingSchema = z.object({
  schemaVersion: z.literal(1),
  title: text.max(250),
  asset: text.optional(),
  weakness: weaknessInput.optional(),
  severity: severityInput.optional(),
  summary: text.optional(),
  steps: z.union([z.array(text).min(1), text]),
  impact: text,
  poc: text.optional(),
  references: z.array(z.url()).optional(),
});
export type Finding = z.infer<typeof findingSchema>;

export type ImportField = "asset" | "weakness" | "severity";

export interface ImportIssue {
  field: ImportField;
  message: string;
}

export interface ImportContext {
  scopes: readonly StructuredScope[];
  weaknesses: readonly Weakness[];
}

export type ParsedFinding = { ok: true; finding: Finding } | { ok: false; errors: string[] };

export interface ImportResult {
  content: Omit<DraftContent, "programHandle" | "acknowledgedExclusions">;
  issues: ImportIssue[];
}

export function parseFinding(raw: string): ParsedFinding {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      errors: [`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  const parsed = findingSchema.safeParse(json);
  if (parsed.success) return { ok: true, finding: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    }),
  };
}

function cweNumber(value: string | number): string | null {
  const match = /^(?:cwe-?)?(\d+)$/i.exec(String(value).trim());
  return match?.[1] ?? null;
}

function matchWeakness(
  input: z.infer<typeof weaknessInput>,
  weaknesses: readonly Weakness[],
): Weakness | null {
  const cwe = typeof input === "object" ? input.cwe : input;
  const name = typeof input === "object" ? input.name : typeof input === "string" ? input : undefined;
  const wanted = cwe === undefined ? null : cweNumber(cwe);
  if (wanted) {
    const byCwe = weaknesses.find((weakness) => cweNumber(weakness.externalId ?? "") === wanted);
    if (byCwe) return byCwe;
  }
  if (name) {
    const normalized = name.trim().toLowerCase();
    return weaknesses.find((weakness) => weakness.name.trim().toLowerCase() === normalized) ?? null;
  }
  return null;
}

function describeWeakness(input: z.infer<typeof weaknessInput>): string {
  if (typeof input !== "object") return String(input);
  return [input.cwe === undefined ? null : String(input.cwe), input.name].filter(Boolean).join(" ");
}

function stepsMarkdown(steps: Finding["steps"]): string {
  if (typeof steps === "string") return steps;
  return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
}

function hasFence(markdown: string): boolean {
  return /^\s*(```|~~~)/m.test(markdown);
}

export function vulnerabilityMarkdown(finding: Finding, severity?: { cvss?: string }): string {
  const sections = [
    finding.summary ? `## Summary\n\n${finding.summary}` : null,
    finding.asset ? `## Asset\n\n\`${finding.asset}\`` : null,
    `## Steps to reproduce\n\n${stepsMarkdown(finding.steps)}`,
    finding.poc
      ? `## Proof of concept\n\n${hasFence(finding.poc) ? finding.poc : `\`\`\`\n${finding.poc}\n\`\`\``}`
      : null,
    severity?.cvss ? `## CVSS\n\n\`${severity.cvss}\`` : null,
    finding.references?.length
      ? `## References\n\n${finding.references.map((reference) => `- ${reference}`).join("\n")}`
      : null,
  ];
  return sections.filter((section): section is string => section !== null).join("\n\n");
}

export function mapFinding(finding: Finding, context: ImportContext): ImportResult {
  const issues: ImportIssue[] = [];

  let structuredScopeId: string | null = null;
  if (finding.asset) {
    const match = matchAsset(context.scopes, finding.asset);
    if (match.kind === "eligible") {
      structuredScopeId = match.scope.id;
    } else if (match.kind === "ineligible") {
      issues.push({
        field: "asset",
        message: `${finding.asset} matches ${match.scope.assetIdentifier}, which does not accept submissions.`,
      });
    } else {
      issues.push({ field: "asset", message: `${finding.asset} is not in this program's scope.` });
    }
  } else {
    issues.push({ field: "asset", message: "The finding names no asset. Pick one before submitting." });
  }

  let weaknessId: string | null = null;
  if (finding.weakness !== undefined) {
    const matched = matchWeakness(finding.weakness, context.weaknesses);
    if (matched) {
      weaknessId = matched.id;
    } else {
      issues.push({
        field: "weakness",
        message: `${describeWeakness(finding.weakness)} is not one of this program's weaknesses.`,
      });
    }
  }

  const severity = finding.severity;
  const severityRating: SeverityRating | null =
    severity === undefined ? null : typeof severity === "string" ? severity : severity.rating;
  if (severityRating === null) {
    issues.push({ field: "severity", message: "The finding has no severity. Some programs require one." });
  }

  return {
    content: {
      title: finding.title,
      structuredScopeId,
      weaknessId,
      severityRating,
      vulnerabilityInformation: vulnerabilityMarkdown(
        finding,
        typeof severity === "object" ? { cvss: severity.cvss } : undefined,
      ),
      impact: finding.impact,
    },
    issues,
  };
}
