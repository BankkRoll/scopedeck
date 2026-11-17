/**
 * Earnings aggregation for the earnings page: totals by period, program and type, year-over-year
 * comparison, bounty statistics and CSV rows.
 */
import type { Earning, Payout } from "@/ipc/payments";
import { humanize } from "./format";

/** An aggregated amount for one group, such as a month, year, program or earning type. */
export interface Total {
  key: string;
  label: string;
  amount: number;
  count: number;
}

function sumBy<T>(
  items: readonly T[],
  keyOf: (item: T) => { key: string; label: string } | null,
  amountOf: (item: T) => number,
): Total[] {
  const totals = new Map<string, Total>();
  for (const item of items) {
    const group = keyOf(item);
    if (!group) continue;
    const current = totals.get(group.key) ?? { ...group, amount: 0, count: 0 };
    current.amount += amountOf(item);
    current.count += 1;
    totals.set(group.key, current);
  }
  return [...totals.values()];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(iso: string | null): { key: string; label: string } | null {
  const match = iso ? /^(\d{4})-(\d{2})/.exec(iso) : null;
  if (!match?.[1] || !match[2]) return null;
  const month = Number(match[2]);
  return { key: `${match[1]}-${match[2]}`, label: `${MONTHS[month - 1] ?? match[2]} ${match[1]}` };
}

/** Totals per calendar month (UTC, from the timestamp), oldest first. Undated earnings are skipped. */
export function earningsByMonth(earnings: readonly Earning[]): Total[] {
  return sumBy(
    earnings,
    (earning) => monthKey(earning.createdAt),
    (earning) => earning.amount,
  ).sort((a, b) => a.key.localeCompare(b.key));
}

/** Totals per calendar year, oldest first. Undated earnings are skipped. */
export function earningsByYear(earnings: readonly Earning[]): Total[] {
  return sumBy(
    earnings,
    (earning) => {
      const year = earning.createdAt?.slice(0, 4);
      return year && /^\d{4}$/.test(year) ? { key: year, label: year } : null;
    },
    (earning) => earning.amount,
  ).sort((a, b) => a.key.localeCompare(b.key));
}

/** Totals per program, largest first; earnings without a program are grouped as unattributed. */
export function earningsByProgram(earnings: readonly Earning[]): Total[] {
  return sumBy(
    earnings,
    (earning) => {
      const handle = earning.programHandle ?? "unattributed";
      return { key: handle, label: earning.programName ?? earning.programHandle ?? "Unattributed" };
    },
    (earning) => earning.amount,
  ).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

/** Sums amounts, treating unknown amounts as zero. */
export function totalAmount(items: readonly { amount: number | null }[]): number {
  return items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

/** Totals per earning type (bounty, retest, ...), largest first. */
export function earningsByKind(earnings: readonly Earning[]): Total[] {
  return sumBy(
    earnings,
    (earning) => ({ key: earning.kind, label: humanize(earning.kind) }),
    (earning) => earning.amount,
  ).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

/** This year to date against the same stretch of last year. */
export interface YearOverYear {
  year: number;
  thisYear: number;
  lastYear: number;
  /** Percentage change from last year, or `null` when last year earned nothing to compare with. */
  deltaPercent: number | null;
}

/**
 * Compares earnings from 1 January to `now` against 1 January to the same instant a year
 * earlier, so a partial year is not measured against a full one. Uses UTC throughout, matching
 * the API timestamps; 29 February maps to 28 February in a non-leap year.
 *
 * @example
 * yearOverYear(earnings, new Date("2026-06-30T00:00:00Z")).deltaPercent // 25 when up a quarter
 */
export function yearOverYear(earnings: readonly Earning[], now: Date): YearOverYear {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year - 1, month + 1, 0)).getUTCDate();
  const thisStart = Date.UTC(year, 0, 1);
  const lastStart = Date.UTC(year - 1, 0, 1);
  const lastEnd = Date.UTC(
    year - 1,
    month,
    Math.min(now.getUTCDate(), lastDayOfMonth),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds(),
  );
  let thisYear = 0;
  let lastYear = 0;
  for (const earning of earnings) {
    const at = earning.createdAt ? Date.parse(earning.createdAt) : Number.NaN;
    if (Number.isNaN(at)) continue;
    if (at >= thisStart && at <= now.getTime()) thisYear += earning.amount;
    else if (at >= lastStart && at <= lastEnd) lastYear += earning.amount;
  }
  return {
    year,
    thisYear,
    lastYear,
    deltaPercent: lastYear > 0 ? ((thisYear - lastYear) / lastYear) * 100 : null,
  };
}

/** Summary of bounty-type earnings. Retests, pentests and other payments are not bounties. */
export interface BountyStats {
  count: number;
  /** Mean bounty amount, or `null` with no bounties. */
  average: number | null;
  /** The single largest bounty, or `null` with no bounties. */
  largest: Earning | null;
}

/** Count, average and largest of the bounty-type earnings. */
export function bountyStats(earnings: readonly Earning[]): BountyStats {
  const bounties = earnings.filter((earning) => earning.kind === "bounty");
  const largest = bounties.reduce<Earning | null>(
    (top, earning) => (!top || earning.amount > top.amount ? earning : top),
    null,
  );
  return {
    count: bounties.length,
    average: bounties.length ? totalAmount(bounties) / bounties.length : null,
    largest,
  };
}

/** Fills months with no earnings so a bar chart shows gaps instead of compressing time. */
export function lastMonths(totals: readonly Total[], count: number, now: Date): Total[] {
  const byKey = new Map(totals.map((total) => [total.key, total]));
  const result: Total[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTHS[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
    result.push(byKey.get(key) ?? { key, label, amount: 0, count: 0 });
  }
  return result;
}

/** Earnings as CSV rows, header first. */
export function earningsCsvRows(earnings: readonly Earning[]): string[][] {
  return [
    ["id", "type", "amount_usd", "created_at", "program_handle", "program_name", "report_id"],
    ...earnings.map((earning) => [
      earning.id,
      earning.kind,
      earning.amount.toFixed(2),
      earning.createdAt ?? "",
      earning.programHandle ?? "",
      earning.programName ?? "",
      earning.reportId ?? "",
    ]),
  ];
}

/** Payouts as CSV rows, header first. */
export function payoutsCsvRows(payouts: readonly Payout[]): string[][] {
  return [
    ["paid_out_at", "amount_usd", "provider", "status", "reference"],
    ...payouts.map((payout) => [
      payout.paidOutAt ?? "",
      payout.amount === null ? "" : payout.amount.toFixed(2),
      payout.payoutProvider ?? "",
      payout.status ?? "",
      payout.reference ?? "",
    ]),
  ];
}
