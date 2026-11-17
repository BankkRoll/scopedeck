import type { Earning, Payout } from "@/ipc/payments";

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

export function earningsByMonth(earnings: readonly Earning[]): Total[] {
  return sumBy(
    earnings,
    (earning) => monthKey(earning.createdAt),
    (earning) => earning.amount,
  ).sort((a, b) => a.key.localeCompare(b.key));
}

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

export function totalAmount(items: readonly { amount: number | null }[]): number {
  return items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
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
