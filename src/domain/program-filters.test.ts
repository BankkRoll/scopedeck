import { describe, expect, it } from "vitest";
import type { ProgramRow } from "@/ipc/programs";
import {
  EMPTY_PROGRAM_FILTERS,
  activeProgramFilterCount,
  programMatches,
  sortPrograms,
} from "./program-filters";

function row(overrides: Partial<ProgramRow> & Pick<ProgramRow, "handle">): ProgramRow {
  return {
    id: overrides.handle,
    name: overrides.handle,
    currency: "usd",
    policy: null,
    profilePicture: null,
    submissionState: "open",
    state: "public_mode",
    triageActive: null,
    startedAcceptingAt: "2024-01-01T00:00:00Z",
    numberOfReportsForUser: 0,
    numberOfValidReportsForUser: 0,
    bountyEarnedForUser: 0,
    lastInvitationAcceptedAtForUser: null,
    bookmarked: null,
    allowsBountySplitting: null,
    offersBounties: true,
    openScope: null,
    fastPayments: null,
    goldStandardSafeHarbor: null,
    pinned: false,
    ...overrides,
  };
}

describe("programMatches", () => {
  it("keeps everything with no filters", () => {
    expect(programMatches(row({ handle: "a" }), EMPTY_PROGRAM_FILTERS)).toBe(true);
    expect(activeProgramFilterCount(EMPTY_PROGRAM_FILTERS)).toBe(0);
  });

  it("filters by type, perks and reporting history", () => {
    const vdp = row({ handle: "vdp", offersBounties: false });
    const fast = row({ handle: "fast", fastPayments: true, numberOfReportsForUser: 2 });
    expect(programMatches(vdp, { ...EMPTY_PROGRAM_FILTERS, types: ["bounty"] })).toBe(false);
    expect(programMatches(fast, { ...EMPTY_PROGRAM_FILTERS, perks: ["fastPayments"] })).toBe(true);
    expect(programMatches(vdp, { ...EMPTY_PROGRAM_FILTERS, perks: ["fastPayments"] })).toBe(false);
    expect(programMatches(fast, { ...EMPTY_PROGRAM_FILTERS, reported: "no" })).toBe(false);
  });

  it("excludes programs without a launch date from a date range", () => {
    const unknown = row({ handle: "u", startedAcceptingAt: null });
    const filters = { ...EMPTY_PROGRAM_FILTERS, launchedFrom: "2023-01-01" };
    expect(programMatches(unknown, filters)).toBe(false);
    expect(programMatches(row({ handle: "k" }), filters)).toBe(true);
    expect(activeProgramFilterCount(filters)).toBe(1);
  });
});

describe("sortPrograms", () => {
  it("keeps pinned programs first and respects direction", () => {
    const rows = [
      row({ handle: "a", bountyEarnedForUser: 5 }),
      row({ handle: "b", bountyEarnedForUser: 50 }),
      row({ handle: "c", bountyEarnedForUser: 1, pinned: true }),
    ];
    expect(sortPrograms(rows, "earned", true).map((r) => r.handle)).toEqual(["c", "b", "a"]);
    expect(sortPrograms(rows, "earned", false).map((r) => r.handle)).toEqual(["c", "a", "b"]);
    expect(sortPrograms(rows, "default", false).map((r) => r.handle)).toEqual(["c", "a", "b"]);
  });
});
