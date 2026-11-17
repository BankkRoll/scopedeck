import { describe, expect, it } from "vitest";
import type { Earning } from "@/ipc/payments";
import { toCsv } from "./csv";
import {
  bountyStats,
  earningsByKind,
  earningsByMonth,
  earningsByProgram,
  earningsByYear,
  earningsCsvRows,
  lastMonths,
  totalAmount,
  yearOverYear,
} from "./earnings";

function earning(
  id: string,
  amount: number,
  createdAt: string | null,
  programHandle: string | null,
): Earning {
  return {
    id,
    kind: "bounty",
    amount,
    createdAt,
    programHandle,
    programName: programHandle ? programHandle.toUpperCase() : null,
    reportId: null,
  };
}

const earnings = [
  earning("1", 500, "2026-01-15T10:00:00Z", "acme"),
  earning("2", 250, "2026-01-30T10:00:00Z", "globex"),
  earning("3", 1000, "2025-12-01T00:00:00Z", "acme"),
  earning("4", 50, null, null),
];

describe("earnings aggregation", () => {
  it("totals by month, year and program", () => {
    expect(earningsByMonth(earnings)).toEqual([
      { key: "2025-12", label: "Dec 2025", amount: 1000, count: 1 },
      { key: "2026-01", label: "Jan 2026", amount: 750, count: 2 },
    ]);
    expect(earningsByYear(earnings).map((total) => [total.key, total.amount])).toEqual([
      ["2025", 1000],
      ["2026", 750],
    ]);
    expect(earningsByProgram(earnings).map((total) => [total.key, total.amount])).toEqual([
      ["acme", 1500],
      ["globex", 250],
      ["unattributed", 50],
    ]);
    expect(totalAmount(earnings)).toBe(1800);
  });

  it("fills empty months in a trailing window", () => {
    const window = lastMonths(earningsByMonth(earnings), 3, new Date(Date.UTC(2026, 1, 10)));
    expect(window.map((total) => [total.key, total.amount])).toEqual([
      ["2025-12", 1000],
      ["2026-01", 750],
      ["2026-02", 0],
    ]);
  });
});

describe("csv export", () => {
  it("quotes separators and neutralises spreadsheet formulas", () => {
    const csv = toCsv([
      ["name", "value"],
      ["a,b", '=HYPERLINK("x")'],
      ["-12.5", "@sum"],
    ]);
    expect(csv).toBe('name,value\r\n"a,b","\'=HYPERLINK(""x"")"\r\n-12.5,\'@sum\r\n');
  });

  it("exports earnings with a header row", () => {
    const rows = earningsCsvRows(earnings.slice(0, 1));
    expect(rows[0]?.[0]).toBe("id");
    expect(rows[1]).toEqual(["1", "bounty", "500.00", "2026-01-15T10:00:00Z", "acme", "ACME", ""]);
  });
});

function ofKind(kind: Earning["kind"], amount: number, createdAt: string | null = null): Earning {
  return { ...earning(`${kind}-${String(amount)}`, amount, createdAt, "acme"), kind };
}

describe("earningsByKind", () => {
  it("totals each type, largest first and alphabetical on ties", () => {
    const totals = earningsByKind([
      ofKind("retest", 50),
      ofKind("bounty", 500),
      ofKind("retest", 75),
      ofKind("bounty", 100),
      ofKind("pentest", 125),
    ]);
    expect(totals).toEqual([
      { key: "bounty", label: "Bounty", amount: 600, count: 2 },
      { key: "pentest", label: "Pentest", amount: 125, count: 1 },
      { key: "retest", label: "Retest", amount: 125, count: 2 },
    ]);
  });
});

describe("yearOverYear", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("compares this year to date with the same stretch of last year", () => {
    const result = yearOverYear(
      [
        earning("1", 1000, "2026-01-10T00:00:00Z", "acme"),
        earning("2", 500, "2026-06-15T11:59:59Z", "acme"),
        earning("3", 9999, "2026-06-20T00:00:00Z", "acme"),
        earning("4", 1000, "2025-03-01T00:00:00Z", "acme"),
        earning("5", 200, "2025-06-15T12:00:00Z", "acme"),
        earning("6", 5000, "2025-06-15T12:00:01Z", "acme"),
        earning("7", 7000, "2024-06-01T00:00:00Z", "acme"),
        earning("8", 300, null, null),
      ],
      now,
    );
    expect(result).toEqual({ year: 2026, thisYear: 1500, lastYear: 1200, deltaPercent: 25 });
  });

  it("reports a decline as a negative percentage", () => {
    const result = yearOverYear(
      [earning("1", 250, "2026-02-01T00:00:00Z", "acme"), earning("2", 1000, "2025-02-01T00:00:00Z", "acme")],
      now,
    );
    expect(result.deltaPercent).toBe(-75);
  });

  it("has no percentage when last year earned nothing", () => {
    expect(yearOverYear([earning("1", 100, "2026-01-02T00:00:00Z", "acme")], now)).toEqual({
      year: 2026,
      thisYear: 100,
      lastYear: 0,
      deltaPercent: null,
    });
  });

  it("maps 29 February onto the end of February in the previous year", () => {
    const leap = new Date("2028-02-29T23:00:00Z");
    const result = yearOverYear(
      [earning("1", 100, "2027-02-28T22:00:00Z", "acme"), earning("2", 100, "2027-03-01T00:00:00Z", "acme")],
      leap,
    );
    expect(result.lastYear).toBe(100);
  });
});

describe("bountyStats", () => {
  it("averages and finds the largest bounty, ignoring other payment types", () => {
    const stats = bountyStats([ofKind("bounty", 300), ofKind("pentest", 10000), ofKind("bounty", 900)]);
    expect(stats.count).toBe(2);
    expect(stats.average).toBe(600);
    expect(stats.largest?.amount).toBe(900);
  });

  it("is empty without bounties", () => {
    expect(bountyStats([ofKind("retest", 50)])).toEqual({ count: 0, average: null, largest: null });
  });
});
