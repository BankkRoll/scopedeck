import { describe, expect, it } from "vitest";
import type { Report } from "@/ipc/reports";
import { scope } from "@/testing/fixtures";
import {
  ciaRequirements,
  formatPercent,
  programHacktivityQuery,
  reportsForProgram,
  scopeTimestamp,
  sortScopesNewestFirst,
  validReportRate,
} from "./program-insights";

function report(id: string, handle: string | null, submittedAt: string | null): Report {
  return {
    id,
    title: `Report ${id}`,
    vulnerabilityInformation: null,
    state: "new",
    createdAt: "2026-01-01T00:00:00Z",
    submittedAt,
    triagedAt: null,
    closedAt: null,
    lastActivityAt: null,
    lastReporterActivityAt: null,
    firstProgramActivityAt: null,
    lastProgramActivityAt: null,
    bountyAwardedAt: null,
    disclosedAt: null,
    cveIds: [],
    program: handle ? { id: "1", handle } : null,
    weakness: null,
    severity: null,
    structuredScope: null,
    activities: [],
    attachments: [],
    bounties: [],
    summaries: [],
  };
}

describe("validReportRate", () => {
  it("is null without reports and clamps to 0–1", () => {
    expect(validReportRate(0, 0)).toBeNull();
    expect(validReportRate(null, 3)).toBeNull();
    expect(validReportRate(4, 3)).toBe(0.75);
    expect(validReportRate(2, 5)).toBe(1);
    expect(validReportRate(3, null)).toBe(0);
  });

  it("formats as a whole percentage", () => {
    expect(formatPercent(2 / 3)).toBe("67%");
  });
});

describe("reportsForProgram", () => {
  it("keeps the program's reports, newest first, matching handles case-insensitively", () => {
    const reports = [
      report("1", "acme", "2026-02-01T00:00:00Z"),
      report("2", "other", "2026-03-01T00:00:00Z"),
      report("3", "ACME", "2026-04-01T00:00:00Z"),
      report("4", null, "2026-05-01T00:00:00Z"),
      report("5", "acme", null),
    ];
    expect(reportsForProgram(reports, "acme").map((r) => r.id)).toEqual(["3", "1", "5"]);
  });
});

describe("programHacktivityQuery", () => {
  it("scopes disclosed reports to the team", () => {
    expect(programHacktivityQuery("acme")).toBe("disclosed:true AND team:acme");
  });
});

describe("scopeTimestamp", () => {
  it("reports an edit only when it lands well after creation", () => {
    expect(
      scopeTimestamp(
        scope({
          id: "1",
          assetIdentifier: "1.example",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:05Z",
        }),
      ),
    ).toEqual({ kind: "Added", at: "2026-01-01T00:00:00Z" });
    expect(
      scopeTimestamp(
        scope({
          id: "1",
          assetIdentifier: "1.example",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-03-01T00:00:00Z",
        }),
      ),
    ).toEqual({ kind: "Updated", at: "2026-03-01T00:00:00Z" });
    expect(
      scopeTimestamp(scope({ id: "1", assetIdentifier: "1.example", createdAt: null, updatedAt: null })),
    ).toBeNull();
  });
});

describe("sortScopesNewestFirst", () => {
  it("orders by the latest add or edit with undated assets last", () => {
    const sorted = sortScopesNewestFirst([
      scope({
        id: "old",
        assetIdentifier: "old.example",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: null,
      }),
      scope({ id: "none", assetIdentifier: "none.example", createdAt: null, updatedAt: null }),
      scope({
        id: "edited",
        assetIdentifier: "edited.example",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      }),
      scope({
        id: "new",
        assetIdentifier: "new.example",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: null,
      }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["edited", "new", "old", "none"]);
  });
});

describe("ciaRequirements", () => {
  it("lists only the requirements an asset sets", () => {
    expect(
      ciaRequirements(
        scope({
          id: "1",
          assetIdentifier: "1.example",
          confidentialityRequirement: "high",
          integrityRequirement: null,
          availabilityRequirement: "low",
        }),
      ),
    ).toEqual([
      { key: "C", label: "Confidentiality", value: "high" },
      { key: "A", label: "Availability", value: "low" },
    ]);
  });
});
