import { describe, expect, it } from "vitest";
import type { Earning } from "@/ipc/payments";
import { toCsv } from "./csv";
import {
  earningsByMonth,
  earningsByProgram,
  earningsByYear,
  earningsCsvRows,
  lastMonths,
  totalAmount,
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
