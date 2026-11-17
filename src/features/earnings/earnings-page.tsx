import { ArrowUpRight, Download } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { describeError, toAppError } from "@/ipc/errors";
import { earningsCached, earningsSync, type Earning, type Payout } from "@/ipc/payments";
import { saveTextFile } from "@/ipc/system";
import { DataTable } from "@/components/data-table";
import { openOnHackerOne } from "@/lib/open-external";
import { EmptyState, ErrorNotice, PageHeader, SyncStatus } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toCsv } from "@/domain/csv";
import { hackerOne } from "@/domain/deep-links";
import {
  earningsByMonth,
  earningsByProgram,
  earningsByYear,
  earningsCsvRows,
  lastMonths,
  payoutsCsvRows,
  totalAmount,
  type Total,
} from "@/domain/earnings";
import { formatDate, formatMoney, humanize } from "@/domain/format";
import { columnHelper } from "@/lib/table";
import { useViewAction } from "@/features/shell/view-actions";
import { queryKeys } from "@/query/keys";
import { useCachedResource } from "@/query/use-cached-resource";
import { BarChart } from "./bar-chart";

const earningHelper = columnHelper<Earning>();
const earningColumns = earningHelper.columns([
  earningHelper.accessor((row) => row.createdAt ?? "", {
    id: "date",
    header: "Date",
    size: 130,
    cell: (info) => <span className="text-muted">{formatDate(info.getValue())}</span>,
  }),
  earningHelper.accessor("kind", { header: "Type", size: 110, cell: (info) => humanize(info.getValue()) }),
  earningHelper.accessor((row) => row.programName ?? row.programHandle ?? "", {
    id: "program",
    header: "Program",
  }),
  earningHelper.accessor((row) => row.reportId ?? "", {
    id: "report",
    header: "Report",
    size: 110,
    cell: (info) =>
      info.getValue() ? <span className="font-mono text-faint">#{info.getValue()}</span> : null,
  }),
  earningHelper.accessor("amount", {
    header: "Amount",
    size: 120,
    cell: (info) => <span className="font-mono tabular-nums">{formatMoney(info.getValue())}</span>,
  }),
]);

const payoutHelper = columnHelper<Payout>();
const payoutColumns = payoutHelper.columns([
  payoutHelper.accessor((row) => row.paidOutAt ?? "", {
    id: "date",
    header: "Paid out",
    size: 140,
    cell: (info) => <span className="text-muted">{formatDate(info.getValue())}</span>,
  }),
  payoutHelper.accessor((row) => row.payoutProvider ?? "", { id: "provider", header: "Provider", size: 140 }),
  payoutHelper.accessor((row) => row.status ?? "", {
    id: "status",
    header: "Status",
    size: 120,
    cell: (info) => humanize(info.getValue()),
  }),
  payoutHelper.accessor((row) => row.reference ?? "", {
    id: "reference",
    header: "Reference",
    cell: (info) => <span className="selectable font-mono text-faint">{info.getValue()}</span>,
  }),
  payoutHelper.accessor((row) => row.amount ?? 0, {
    id: "amount",
    header: "Amount",
    size: 120,
    cell: (info) => <span className="font-mono tabular-nums">{formatMoney(info.getValue())}</span>,
  }),
]);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-r border-line px-5 py-4 last:border-r-0">
      <span className="text-[13px] text-faint">{label}</span>
      <span className="font-mono text-[22px] leading-7 tracking-tight tabular-nums">{value}</span>
    </div>
  );
}

function TotalsList({ title, totals }: { title: string; totals: Total[] }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h2 className="mb-1 text-[13px] font-medium text-faint">{title}</h2>
      <ul className="max-h-48 overflow-y-auto">
        {totals.map((total) => (
          <li key={total.key} className="flex justify-between gap-3 border-b border-line py-1.5 text-[13px]">
            <span className="truncate text-muted">{total.label}</span>
            <span className="font-mono tabular-nums">{formatMoney(total.amount)}</span>
          </li>
        ))}
        {totals.length === 0 ? <li className="py-1.5 text-faint">Nothing yet</li> : null}
      </ul>
    </section>
  );
}

async function exportCsv(name: string, rows: string[][]) {
  try {
    const saved = await saveTextFile(name, "csv", toCsv(rows));
    if (saved) toast.success(`Saved ${name}`);
  } catch (error) {
    toast.error(describeError(toAppError(error)).title);
  }
}

export function EarningsPage() {
  const snapshot = useCachedResource({
    cacheKey: queryKeys.earnings.cached,
    syncKey: queryKeys.earnings.sync,
    readCache: earningsCached,
    sync: earningsSync,
  });
  useViewAction("refresh", snapshot.refresh);
  const earnings = useMemo(() => snapshot.data?.earnings ?? [], [snapshot.data]);
  const payouts = useMemo(() => snapshot.data?.payouts ?? [], [snapshot.data]);
  const months = useMemo(() => lastMonths(earningsByMonth(earnings), 12, new Date()), [earnings]);
  const years = useMemo(() => earningsByYear(earnings).reverse(), [earnings]);
  const programs = useMemo(() => earningsByProgram(earnings), [earnings]);

  return (
    <>
      <PageHeader
        title="Earnings"
        meta="Amounts in USD"
        actions={
          <>
            <SyncStatus
              syncedAt={snapshot.syncedAt}
              syncing={snapshot.syncing}
              onRefresh={snapshot.refresh}
            />
            <Button onClick={() => void openOnHackerOne(hackerOne.paymentSetup)}>
              Payout settings
              <ArrowUpRight />
            </Button>
          </>
        }
      />
      {snapshot.syncError ? <ErrorNotice error={snapshot.syncError} className="mx-5 mt-3" /> : null}
      <div className="grid shrink-0 grid-cols-4 border-b border-line">
        <Stat
          label="Balance"
          value={snapshot.data?.balance ? formatMoney(snapshot.data.balance.balance) : "-"}
        />
        <Stat label="Total earned" value={formatMoney(totalAmount(earnings))} />
        <Stat label="Paid out" value={formatMoney(totalAmount(payouts))} />
        <Stat label="Earning events" value={String(earnings.length)} />
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-8 border-b border-line px-5 py-4">
        <BarChart data={months} title="Last 12 months" />
        <TotalsList title="By year" totals={years} />
        <TotalsList title="By program" totals={programs} />
      </div>
      <Tabs defaultValue="earnings" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="items-center">
          <TabsTrigger value="earnings">
            Earnings <span className="font-mono text-faint">{earnings.length}</span>
          </TabsTrigger>
          <TabsTrigger value="payouts">
            Payouts <span className="font-mono text-faint">{payouts.length}</span>
          </TabsTrigger>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              disabled={earnings.length === 0}
              onClick={() => void exportCsv("earnings.csv", earningsCsvRows(earnings))}
            >
              <Download />
              Earnings CSV
            </Button>
            <Button
              size="sm"
              disabled={payouts.length === 0}
              onClick={() => void exportCsv("payouts.csv", payoutsCsvRows(payouts))}
            >
              <Download />
              Payouts CSV
            </Button>
          </div>
        </TabsList>
        <TabsContent value="earnings" className="flex flex-col">
          <DataTable
            label="Earnings"
            data={earnings}
            columns={earningColumns}
            getRowId={(row) => row.id}
            initialSorting={[{ id: "date", desc: true }]}
            empty={<EmptyState title={snapshot.loadingCache ? "Loading" : "No earnings yet"} />}
          />
        </TabsContent>
        <TabsContent value="payouts" className="flex flex-col">
          <DataTable
            label="Payouts"
            data={payouts}
            columns={payoutColumns}
            getRowId={(row, index) => `${row.reference ?? "payout"}-${index}`}
            initialSorting={[{ id: "date", desc: true }]}
            empty={<EmptyState title={snapshot.loadingCache ? "Loading" : "No payouts yet"} />}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
