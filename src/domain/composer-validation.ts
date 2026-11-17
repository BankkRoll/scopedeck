import type { ScopeExclusion, StructuredScope, Weakness } from "@/ipc/programs";
import type { NewReport } from "@/ipc/reports";
import type { DraftContent } from "@/ipc/workspace";

export const TITLE_LIMIT = 250;

export type ComposerField =
  | "programHandle"
  | "title"
  | "structuredScopeId"
  | "weaknessId"
  | "severityRating"
  | "vulnerabilityInformation"
  | "impact"
  | "acknowledgedExclusions";

export interface ComposerProblem {
  field: ComposerField;
  message: string;
  blocking: boolean;
}

export interface ComposerContext {
  scopes: readonly StructuredScope[];
  weaknesses: readonly Weakness[];
  exclusions: readonly ScopeExclusion[];
}

export function validateDraft(draft: DraftContent, context: ComposerContext): ComposerProblem[] {
  const problems: ComposerProblem[] = [];
  const block = (field: ComposerField, message: string) => problems.push({ field, message, blocking: true });
  const warn = (field: ComposerField, message: string) => problems.push({ field, message, blocking: false });

  if (!draft.programHandle) block("programHandle", "Choose a program.");

  const title = draft.title.trim();
  if (!title) block("title", "Write a title.");
  else if (title.length > TITLE_LIMIT) block("title", `Titles are limited to ${TITLE_LIMIT} characters.`);

  if (!draft.vulnerabilityInformation.trim()) {
    block("vulnerabilityInformation", "Describe the vulnerability and how to reproduce it.");
  }
  if (!draft.impact.trim()) block("impact", "Explain the impact.");

  if (draft.structuredScopeId === null) {
    if (context.scopes.length > 0) warn("structuredScopeId", "No asset selected. Triage is faster with one.");
  } else {
    const selected = context.scopes.find((scope) => scope.id === draft.structuredScopeId);
    if (!selected) block("structuredScopeId", "The selected asset is no longer in this program's scope.");
    else if (!selected.eligibleForSubmission) {
      block("structuredScopeId", `${selected.assetIdentifier} does not accept submissions.`);
    }
  }

  if (draft.weaknessId !== null && !context.weaknesses.some((weakness) => weakness.id === draft.weaknessId)) {
    block("weaknessId", "The selected weakness is not offered by this program.");
  }

  if (draft.severityRating === null) {
    warn("severityRating", "No severity selected. Some programs reject reports without one.");
  }

  const acknowledged = new Set(draft.acknowledgedExclusions);
  const outstanding = context.exclusions.filter((exclusion) => !acknowledged.has(exclusion.id));
  if (outstanding.length > 0) {
    block(
      "acknowledgedExclusions",
      outstanding.length === 1
        ? "Confirm the finding is not in the excluded category."
        : `Confirm the finding is not in any of the ${outstanding.length} excluded categories.`,
    );
  }

  return problems;
}

export function canSubmit(problems: readonly ComposerProblem[]): boolean {
  return problems.every((problem) => !problem.blocking);
}

export function toNewReport(draft: DraftContent): NewReport | null {
  if (!draft.programHandle) return null;
  return {
    teamHandle: draft.programHandle,
    title: draft.title.trim(),
    vulnerabilityInformation: draft.vulnerabilityInformation,
    impact: draft.impact,
    severityRating: draft.severityRating,
    weaknessId: draft.weaknessId,
    structuredScopeId: draft.structuredScopeId,
  };
}

export type SubmissionPath = "intent" | "direct";

export function submissionPath(input: {
  attachmentCount: number;
  intentSupport: "unknown" | "supported" | "unsupported";
}): SubmissionPath {
  return input.attachmentCount > 0 && input.intentSupport !== "unsupported" ? "intent" : "direct";
}
