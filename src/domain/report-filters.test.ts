import { describe, expect, it } from "vitest";
import type { Bounty, Report } from "@/ipc/reports";
import {
  BOARD_COLUMNS,
  DEFAULT_REPORT_FILTERS,
  NO_REPORT_FILTERS,
  activeReportFilterCount,
  groupIntoBoard,
  needsAttention,
  reportFiltersSchema,
  reportPassesFilters,
  severityKey,
  sortByWaiting,
  sortReports,
  waitingSince,
} from "./report-filters";

function report(id: string, overrides: Partial<Report> = {}): Report {
  return {
    id,
    title: `Report ${id}`,
    vulnerabilityInformation: null,
    state: "triaged",
    createdAt: "2026-10-01T10:00:00Z",
    submittedAt: "2026-10-01T10:00:00Z",
    triagedAt: null,
    closedAt: null,
    lastActivityAt: "2026-10-01T10:00:00Z",
    lastReporterActivityAt: null,
    firstProgramActivityAt: null,
    lastProgramActivityAt: null,
    bountyAwardedAt: null,
    disclosedAt: null,
    cveIds: [],
    program: { id: "1", handle: "acme" },
    weakness: null,
    severity: null,
    structuredScope: null,
    activities: [],
    attachments: [],
    bounties: [],
    summaries: [],
    ...overrides,
  };
}

function bounty(amount: string, bonusAmount: string | null = null): Bounty {
  return {
    id: amount,
    amount,
    bonusAmount,
    awardedAmount: null,
    awardedBonusAmount: null,
    awardedCurrency: null,
    createdAt: null,
  };
}

function rated(value: string): Pick<Report, "severity"> {
  return {
    severity: {
      id: value,
      rating: value,
      authorType: null,
      score: null,
      attackVector: null,
      attackComplexity: null,
      privilegesRequired: null,
      userInteraction: null,
      scope: null,
      confidentiality: null,
      integrity: null,
      availability: null,
      createdAt: null,
    },
  };
}

const ids = (reports: readonly Report[]) => reports.map((item) => item.id);

describe("reportFiltersSchema", () => {
  it("parses filters persisted before the attention filter existed", () => {
    const legacy = { openOnly: false, states: ["triaged"], severities: [], programs: [] };
    expect(reportFiltersSchema.parse(legacy)).toMatchObject({
      openOnly: false,
      attention: false,
      states: ["triaged"],
      bountyMin: null,
    });
  });

  it("defaults to open reports only and resets to nothing", () => {
    expect(DEFAULT_REPORT_FILTERS).toMatchObject({ openOnly: true, attention: false });
    expect(activeReportFilterCount(DEFAULT_REPORT_FILTERS)).toBe(1);
    expect(activeReportFilterCount(NO_REPORT_FILTERS)).toBe(0);
  });

  it("counts each independent filter once", () => {
    expect(
      activeReportFilterCount({
        ...NO_REPORT_FILTERS,
        attention: true,
        states: ["new", "triaged"],
        bountyMin: 100,
        bountyMax: 500,
        submittedFrom: "2026-01-01",
      }),
    ).toBe(4);
  });
});

describe("needsAttention", () => {
  it("flags reports where the program asked for more information", () => {
    expect(needsAttention(report("1", { state: "needs-more-info" }))).toBe(true);
  });

  it("flags open reports where the program replied after the hacker", () => {
    const replied = report("1", {
      lastReporterActivityAt: "2026-10-02T10:00:00Z",
      lastProgramActivityAt: "2026-10-03T10:00:00Z",
    });
    expect(needsAttention(replied)).toBe(true);
    expect(needsAttention({ ...replied, lastReporterActivityAt: "2026-10-04T10:00:00Z" })).toBe(false);
  });

  it("treats the submission as the last hacker activity when they never replied", () => {
    expect(needsAttention(report("1", { lastProgramActivityAt: "2026-10-02T10:00:00Z" }))).toBe(true);
    expect(needsAttention(report("2"))).toBe(false);
  });

  it("compares instants rather than strings", () => {
    const offset = report("1", {
      lastReporterActivityAt: "2026-10-02T12:00:00+02:00",
      lastProgramActivityAt: "2026-10-02T11:00:00Z",
    });
    expect(needsAttention(offset)).toBe(true);
  });

  it("ignores closed reports the program had the last word on", () => {
    expect(
      needsAttention(report("1", { state: "resolved", lastProgramActivityAt: "2026-10-05T10:00:00Z" })),
    ).toBe(false);
  });
});

describe("sortByWaiting", () => {
  it("puts the report waiting longest first and undated reports last", () => {
    const sorted = sortByWaiting([
      report("1", { lastProgramActivityAt: "2026-10-05T10:00:00Z" }),
      report("2", { lastActivityAt: null, createdAt: null }),
      report("3", { lastProgramActivityAt: "2026-10-02T10:00:00Z" }),
      report("4", { state: "needs-more-info", lastActivityAt: "2026-10-03T10:00:00Z" }),
    ]);
    expect(ids(sorted)).toEqual(["3", "4", "1", "2"]);
  });

  it("falls back to the last activity when the program never acted", () => {
    expect(waitingSince(report("1", { lastActivityAt: "2026-10-09T00:00:00Z" }))).toBe(
      "2026-10-09T00:00:00Z",
    );
  });
});

describe("reportPassesFilters", () => {
  it("applies the open-only and attention filters", () => {
    const resolved = report("1", { state: "resolved" });
    const waiting = report("2", { state: "needs-more-info" });
    const quiet = report("3");
    expect(reportPassesFilters(resolved, DEFAULT_REPORT_FILTERS)).toBe(false);
    expect(reportPassesFilters(resolved, NO_REPORT_FILTERS)).toBe(true);
    const attention = { ...NO_REPORT_FILTERS, attention: true };
    expect(reportPassesFilters(waiting, attention)).toBe(true);
    expect(reportPassesFilters(quiet, attention)).toBe(false);
  });

  it("filters by state, severity and program", () => {
    const item = report("1", rated("High"));
    expect(reportPassesFilters(item, { ...NO_REPORT_FILTERS, states: ["triaged"] })).toBe(true);
    expect(reportPassesFilters(item, { ...NO_REPORT_FILTERS, states: ["new"] })).toBe(false);
    expect(reportPassesFilters(item, { ...NO_REPORT_FILTERS, severities: ["high"] })).toBe(true);
    expect(reportPassesFilters(report("2"), { ...NO_REPORT_FILTERS, severities: ["unrated"] })).toBe(true);
    expect(reportPassesFilters(item, { ...NO_REPORT_FILTERS, programs: ["globex"] })).toBe(false);
  });

  it("filters by bounty range including bonuses", () => {
    const paid = report("1", { bounties: [bounty("400"), bounty("50", "100")] });
    expect(reportPassesFilters(paid, { ...NO_REPORT_FILTERS, bountyMin: 550 })).toBe(true);
    expect(reportPassesFilters(paid, { ...NO_REPORT_FILTERS, bountyMin: 551 })).toBe(false);
    expect(reportPassesFilters(paid, { ...NO_REPORT_FILTERS, bountyMax: 549 })).toBe(false);
  });

  it("filters by submission date, inclusive, excluding undated reports", () => {
    const item = report("1", { submittedAt: "2026-10-01T23:00:00Z" });
    const range = { ...NO_REPORT_FILTERS, submittedFrom: "2026-10-01", submittedTo: "2026-10-01" };
    expect(reportPassesFilters(item, range)).toBe(true);
    expect(reportPassesFilters(item, { ...range, submittedFrom: "2026-10-02", submittedTo: null })).toBe(
      false,
    );
    expect(reportPassesFilters(report("2", { submittedAt: null, createdAt: null }), range)).toBe(false);
  });
});

describe("sortReports", () => {
  const items = [
    report("10", { ...rated("low"), title: "b" }),
    report("9", { ...rated("critical"), title: "a" }),
    report("100", { title: "c" }),
  ];

  it("sorts by severity rank and numeric id", () => {
    expect(ids(sortReports(items, "severity", true))).toEqual(["9", "10", "100"]);
    expect(ids(sortReports(items, "id", false))).toEqual(["9", "10", "100"]);
    expect(ids(sortReports(items, "title", false))).toEqual(["9", "10", "100"]);
  });

  it("falls back to last activity for unknown keys", () => {
    const dated = [
      report("1", { lastActivityAt: "2026-10-01T00:00:00Z" }),
      report("2", { lastActivityAt: "2026-10-03T00:00:00Z" }),
    ];
    expect(ids(sortReports(dated, "nope", true))).toEqual(["2", "1"]);
  });

  it("reads severity case-insensitively", () => {
    expect(severityKey(report("1", rated("HIGH")))).toBe("high");
    expect(severityKey(report("2"))).toBe("unrated");
  });
});

describe("groupIntoBoard", () => {
  it("places reports in the column for their state and keeps their order", () => {
    const groups = groupIntoBoard([
      report("1", { state: "new" }),
      report("2", { state: "duplicate" }),
      report("3", { state: "new" }),
      report("4", { state: "spam" }),
      report("5", { state: "pending-program-review" }),
    ]);
    expect(groups.map((group) => group.column.label)).toEqual([
      "New",
      "Pending review",
      "Triaged",
      "Needs more info",
      "Retesting",
      "Resolved",
      "Closed",
    ]);
    const byColumn = Object.fromEntries(groups.map((group) => [group.column.id, ids(group.reports)]));
    expect(byColumn).toMatchObject({ new: ["1", "3"], "pending-program-review": ["5"], closed: ["2", "4"] });
  });

  it("puts unknown states in the closed column rather than dropping them", () => {
    const groups = groupIntoBoard([report("1", { state: null }), report("2", { state: "mystery" })]);
    expect(ids(groups.at(-1)?.reports ?? [])).toEqual(["1", "2"]);
    expect(BOARD_COLUMNS.at(-1)?.states).toEqual(["informative", "duplicate", "not-applicable", "spam"]);
  });
});
