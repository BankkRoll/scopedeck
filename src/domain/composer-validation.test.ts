import { describe, expect, it } from "vitest";
import type { DraftContent } from "@/ipc/workspace";
import { scope, weakness } from "@/testing/fixtures";
import { TITLE_LIMIT, canSubmit, submissionPath, toNewReport, validateDraft } from "./composer-validation";

const context = {
  scopes: [
    scope({ id: "1", assetIdentifier: "api.acme.com" }),
    scope({ id: "2", assetIdentifier: "old.acme.com", eligibleForSubmission: false }),
  ],
  weaknesses: [weakness({ id: "60", name: "XSS" })],
  exclusions: [
    { id: "e1", category: "Clickjacking", details: null, createdAt: null, updatedAt: null },
    { id: "e2", category: "Rate limiting", details: null, createdAt: null, updatedAt: null },
  ],
};

const complete: DraftContent = {
  programHandle: "acme",
  title: "IDOR on invoices",
  structuredScopeId: "1",
  weaknessId: "60",
  severityRating: "high",
  vulnerabilityInformation: "Steps",
  impact: "Data exposure",
  acknowledgedExclusions: ["e1", "e2"],
};

const fields = (draft: DraftContent) => validateDraft(draft, context).map((problem) => problem.field);

describe("validateDraft", () => {
  it("passes a complete draft", () => {
    expect(validateDraft(complete, context)).toEqual([]);
    expect(canSubmit(validateDraft(complete, context))).toBe(true);
  });

  it("blocks on missing required fields", () => {
    const empty: DraftContent = {
      ...complete,
      programHandle: null,
      title: " ",
      vulnerabilityInformation: "",
      impact: "\n",
    };
    expect(fields(empty)).toEqual(["programHandle", "title", "vulnerabilityInformation", "impact"]);
    expect(canSubmit(validateDraft(empty, context))).toBe(false);
  });

  it("enforces the title limit", () => {
    expect(fields({ ...complete, title: "x".repeat(TITLE_LIMIT + 1) })).toEqual(["title"]);
  });

  it("blocks ineligible or stale assets and foreign weaknesses", () => {
    expect(fields({ ...complete, structuredScopeId: "2" })).toEqual(["structuredScopeId"]);
    expect(fields({ ...complete, structuredScopeId: "999" })).toEqual(["structuredScopeId"]);
    expect(fields({ ...complete, weaknessId: "1" })).toEqual(["weaknessId"]);
  });

  it("warns without blocking on missing asset or severity", () => {
    const problems = validateDraft({ ...complete, structuredScopeId: null, severityRating: null }, context);
    expect(problems.map((problem) => problem.field)).toEqual(["structuredScopeId", "severityRating"]);
    expect(canSubmit(problems)).toBe(true);
  });

  it("requires every scope exclusion to be acknowledged", () => {
    const problems = validateDraft({ ...complete, acknowledgedExclusions: ["e1"] }, context);
    expect(problems).toEqual([expect.objectContaining({ field: "acknowledgedExclusions", blocking: true })]);
  });
});

describe("toNewReport", () => {
  it("builds the API input and refuses drafts without a program", () => {
    expect(toNewReport({ ...complete, title: "  padded " })).toMatchObject({
      teamHandle: "acme",
      title: "padded",
    });
    expect(toNewReport({ ...complete, programHandle: null })).toBeNull();
  });
});

describe("submissionPath", () => {
  it("uses report intents only for drafts with attachments on programs that allow them", () => {
    expect(submissionPath({ attachmentCount: 0, intentSupport: "supported" })).toBe("direct");
    expect(submissionPath({ attachmentCount: 2, intentSupport: "unknown" })).toBe("intent");
    expect(submissionPath({ attachmentCount: 2, intentSupport: "unsupported" })).toBe("direct");
  });
});
