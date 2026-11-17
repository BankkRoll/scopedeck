import { ArrowUpRight, Download } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { describeError, toAppError } from "@/ipc/errors";
import { earningsCached, earningsSync, type Earning, type Payout } from "@/ipc/payments";
import { saveTextFile } from "@/ipc/system";
import { CardGrid, cardClass } from "@/components/card-grid";
import { DataTable } from "@/components/data-table";
import {
  ActiveFilters,
  ChipGroup,
  DateRange,
  FilterSection,
  FilterSheet,
  NumberRange,
  type ActiveFilter,
} from "@/components/filters";
import { ViewToolbar } from "@/components/view-toolbar";
import { usePersistedState } from "@/lib/persisted-state";
import { sortStateSchema, viewModeSchema, type SortState } from "@/lib/view-state";
import { openOnHackerOne } from "@/lib/open-external";
import { EmptyState, ErrorNotice, PageHeader, SyncStatus } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toCsv } from "@/domain/csv";
import { hackerOne } from "@/domain/deep-links";
import {
  bountyStats,
  earningsByKind,
  earningsByMonth,
  earningsByProgram,
  earningsByYear,
  earningsCsvRows,
  lastMonths,
  payoutsCsvRows,
  totalAmount,
  yearOverYear,
  type Total,
  type YearOverYear,
} from "@/domain/earnings";
import { formatDate, formatMoney, humanize } from "@/domain/format";
import { cn } from "@/lib/cn";
import { columnHelper } from "@/lib/table";
import { ProgramLabel } from "@/features/programs/program-label";
import { useProgramLookup } from "@/features/programs/use-programs";
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
    cell: (info) => (
      <ProgramLabel handle={info.row.original.programHandle} name={info.row.original.programName} />
    ),
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
    cell: (info) => (
      <span className="font-mono text-success tabular-nums">{formatMoney(info.getValue())}</span>
    ),
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
    cell: (info) => (
      <span className="font-mono text-success tabular-nums">{formatMoney(info.getValue())}</span>
    ),
  }),
]);

function Stat({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1 border-r border-line px-5 py-4 last:border-r-0", className)}
    >
      <span className="text-[13px] text-faint">{label}</span>
      <span className="font-mono text-[22px] leading-7 tracking-tight tabular-nums">{value}</span>
      {detail ? <span className="truncate text-[12px] text-faint">{detail}</span> : null}
    </div>
  );
}

function YearOverYearDetail({ comparison }: { comparison: YearOverYear }) {
  const { deltaPercent, lastYear, year } = comparison;
  const previous = `${formatMoney(lastYear)} by this date in ${String(year - 1)}`;
  if (deltaPercent === null) return <>Nothing by this date in {year - 1}</>;
  const rounded = Math.round(deltaPercent);
  return (
    <>
      <span className={cn("font-mono", rounded > 0 && "text-success", rounded < 0 && "text-danger")}>
        {rounded > 0 ? "+" : ""}
        {rounded}%
      </span>{" "}
      vs {previous}
    </>
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

const KINDS = ["bounty", "retest", "pentest", "other"] as const;

const filtersSchema = z.object({
  kinds: z.array(z.enum(KINDS)).default([]),
  programs: z.array(z.string()).default([]),
  amountMin: z.number().nullable().default(null),
  amountMax: z.number().nullable().default(null),
  from: z.string().nullable().default(null),
  to: z.string().nullable().default(null),
});
type EarningFilters = z.infer<typeof filtersSchema>;
const EMPTY_FILTERS: EarningFilters = filtersSchema.parse({});

const SORT_OPTIONS = [
  { value: "date", label: "Date" },
  { value: "amount", label: "Amount" },
  { value: "program", label: "Program" },
];
const DEFAULT_SORT: SortState = { id: "date", desc: true };

const compare: Record<string, (a: Earning, b: Earning) => number> = {
  date: (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  amount: (a, b) => a.amount - b.amount,
  program: (a, b) =>
    (a.programName ?? a.programHandle ?? "").localeCompare(b.programName ?? b.programHandle ?? ""),
};

function EarningCard({ earning }: { earning: Earning }) {
  return (
    <div className={cardClass}>
      <div className="flex w-full items-center justify-between gap-3 text-[12px]">
        <ProgramLabel handle={earning.programHandle} name={earning.programName} />
        <span className="shrink-0 text-faint">{humanize(earning.kind)}</span>
      </div>
      <span className="font-mono text-[22px] leading-7 tracking-tight text-success tabular-nums">
        {formatMoney(earning.amount)}
      </span>
      <div className="mt-auto flex w-full items-center justify-between border-t border-line pt-3 text-[12px] text-faint">
        <span>{formatDate(earning.createdAt)}</span>
        {earning.reportId ? <span className="font-mono">#{earning.reportId}</span> : null}
      </div>
    </div>
  );
}

export function EarningsPage() {
  const snapshot = useCachedResource({
    cacheKey: queryKeys.earnings.cached,
    syncKey: queryKeys.earnings.sync,
    readCache: earningsCached,
    sync: earningsSync,
  });
  useViewAction("refresh", snapshot.refresh);
  const lookup = useProgramLookup();
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = usePersistedState("earnings.mode", viewModeSchema, "cards");
  const [sort, setSort] = usePersistedState("earnings.sort", sortStateSchema, DEFAULT_SORT);
  const [filters, setFilters] = usePersistedState("earnings.filters", filtersSchema, EMPTY_FILTERS);

  const all = useMemo(() => snapshot.data?.earnings ?? [], [snapshot.data]);
  const payouts = useMemo(() => snapshot.data?.payouts ?? [], [snapshot.data]);
  const earnings = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^#/, "");
    const by = compare[sort.id] ?? compare.date;
    const direction = sort.desc ? -1 : 1;
    return all
      .filter((earning) => {
        const haystack = `${earning.programName ?? ""} ${earning.programHandle ?? ""} ${earning.reportId ?? ""}`;
        if (needle && !haystack.toLowerCase().includes(needle)) return false;
        if (filters.kinds.length && !filters.kinds.includes(earning.kind)) return false;
        if (filters.programs.length && !filters.programs.includes(earning.programHandle ?? "")) return false;
        if (filters.amountMin !== null && earning.amount < filters.amountMin) return false;
        if (filters.amountMax !== null && earning.amount > filters.amountMax) return false;
        const day = earning.createdAt?.slice(0, 10) ?? null;
        if (filters.from && (!day || day < filters.from)) return false;
        if (filters.to && (!day || day > filters.to)) return false;
        return true;
      })
      .toSorted((a, b) => (by ? direction * by(a, b) : 0));
  }, [all, query, filters, sort]);
  const months = useMemo(() => lastMonths(earningsByMonth(earnings), 12, new Date()), [earnings]);
  const years = useMemo(() => earningsByYear(earnings).reverse(), [earnings]);
  const programs = useMemo(() => earningsByProgram(earnings), [earnings]);
  const kinds = useMemo(() => earningsByKind(earnings), [earnings]);
  const comparison = useMemo(() => yearOverYear(earnings, new Date()), [earnings]);
  const bounties = useMemo(() => bountyStats(earnings), [earnings]);
  const programHandles = useMemo(
    () => [...new Set(all.map((earning) => earning.programHandle ?? "").filter(Boolean))].sort(),
    [all],
  );

  const set = (patch: Partial<EarningFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };
  const programName = (handle: string) =>
    lookup.get(handle)?.name ??
    all.find((earning) => earning.programHandle === handle)?.programName ??
    handle;
  const activeCount = [
    filters.kinds.length > 0,
    filters.programs.length > 0,
    filters.amountMin !== null || filters.amountMax !== null,
    filters.from !== null || filters.to !== null,
  ].filter(Boolean).length;
  const filtered = activeCount > 0 || query.trim() !== "";

  const chips: ActiveFilter[] = [
    ...filters.kinds.map((kind) => ({
      key: `kind:${kind}`,
      label: humanize(kind),
      onRemove: () => {
        set({ kinds: filters.kinds.filter((value) => value !== kind) });
      },
    })),
    ...filters.programs.map((handle) => ({
      key: `program:${handle}`,
      label: programName(handle),
      onRemove: () => {
        set({ programs: filters.programs.filter((value) => value !== handle) });
      },
    })),
    ...(filters.amountMin !== null || filters.amountMax !== null
      ? [
          {
            key: "amount",
            label: `Amount ${filters.amountMin === null ? "" : formatMoney(filters.amountMin)}–${
              filters.amountMax === null ? "" : formatMoney(filters.amountMax)
            }`,
            onRemove: () => {
              set({ amountMin: null, amountMax: null });
            },
          },
        ]
      : []),
    ...(filters.from !== null || filters.to !== null
      ? [
          {
            key: "date",
            label: `${filters.from ?? ""}–${filters.to ?? ""}`,
            onRemove: () => {
              set({ from: null, to: null });
            },
          },
        ]
      : []),
  ];

  const emptyEarnings = (
    <EmptyState
      title={snapshot.loadingCache ? "Loading" : all.length ? "No earnings match" : "No earnings yet"}
    />
  );

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
      <ViewToolbar
        search={{ value: query, onChange: setQuery, placeholder: "Search by program or #report" }}
        sort={{ options: SORT_OPTIONS, value: sort, onChange: setSort }}
        filters={{
          activeCount,
          onOpen: () => {
            setSheetOpen(true);
          },
        }}
        view={{ mode, onChange: setMode }}
      />
      <ActiveFilters
        filters={chips}
        onClearAll={() => {
          setFilters(EMPTY_FILTERS);
        }}
      />
      {snapshot.syncError ? <ErrorNotice error={snapshot.syncError} className="mx-5 mt-3" /> : null}
      <div className="grid shrink-0 grid-cols-4 border-b border-line">
        <Stat
          label="Balance"
          value={snapshot.data?.balance ? formatMoney(snapshot.data.balance.balance) : "–"}
        />
        <Stat
          label={filtered ? "Earned (filtered)" : "Total earned"}
          value={formatMoney(totalAmount(earnings))}
        />
        <Stat label="Paid out" value={formatMoney(totalAmount(payouts))} />
        <Stat label={filtered ? "Events (filtered)" : "Earning events"} value={String(earnings.length)} />
      </div>
      <div className="grid shrink-0 grid-cols-4 border-b border-line">
        <Stat
          label={`${String(comparison.year)} to date`}
          value={formatMoney(comparison.thisYear)}
          detail={<YearOverYearDetail comparison={comparison} />}
          className="col-span-2"
        />
        <Stat
          label="Average bounty"
          value={bounties.average === null ? "–" : formatMoney(bounties.average)}
          detail={`${bounties.count.toLocaleString()} ${bounties.count === 1 ? "bounty" : "bounties"}`}
        />
        <Stat
          label="Largest bounty"
          value={bounties.largest ? formatMoney(bounties.largest.amount) : "–"}
          detail={
            bounties.largest
              ? [
                  bounties.largest.programName ?? bounties.largest.programHandle,
                  bounties.largest.reportId ? `#${bounties.largest.reportId}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              : undefined
          }
        />
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-8 border-b border-line px-5 py-4">
        <BarChart data={months} title="Last 12 months" />
        <TotalsList title="By year" totals={years} />
        <TotalsList title="By program" totals={programs} />
        <TotalsList title="By type" totals={kinds} />
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
          {mode === "list" ? (
            <DataTable
              label="Earnings"
              data={earnings}
              columns={earningColumns}
              getRowId={(row) => row.id}
              sort={sort}
              onSortChange={setSort}
              sortableIds={["date", "program", "amount"]}
              empty={emptyEarnings}
            />
          ) : (
            <CardGrid
              label="Earnings"
              items={earnings}
              getKey={(earning) => earning.id}
              cardHeight={136}
              minCardWidth={240}
              empty={emptyEarnings}
              renderCard={(earning) => <EarningCard earning={earning} />}
            />
          )}
        </TabsContent>
        <TabsContent value="payouts" className="flex flex-col">
          <DataTable
            label="Payouts"
            data={payouts}
            columns={payoutColumns}
            getRowId={(row, index) => `${row.reference ?? "payout"}-${String(index)}`}
            initialSorting={[{ id: "date", desc: true }]}
            empty={<EmptyState title={snapshot.loadingCache ? "Loading" : "No payouts yet"} />}
          />
        </TabsContent>
      </Tabs>

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        activeCount={activeCount}
        resultCount={earnings.length}
        onReset={() => {
          setFilters(EMPTY_FILTERS);
        }}
      >
        <FilterSection title="Type" description="Totals, the chart and CSV export follow these filters.">
          <ChipGroup
            label="Type"
            value={filters.kinds}
            onChange={(kinds) => {
              set({ kinds });
            }}
            options={KINDS.map((kind) => ({
              value: kind,
              label: humanize(kind),
              count: all.filter((earning) => earning.kind === kind).length,
            }))}
          />
        </FilterSection>
        <FilterSection
          title="Program"
          onClear={
            filters.programs.length
              ? () => {
                  set({ programs: [] });
                }
              : undefined
          }
        >
          <ChipGroup
            label="Program"
            value={filters.programs}
            onChange={(values) => {
              set({ programs: values });
            }}
            options={programHandles.map((handle) => ({
              value: handle,
              label: programName(handle),
              count: all.filter((earning) => earning.programHandle === handle).length,
            }))}
          />
        </FilterSection>
        <FilterSection
          title="Amount"
          onClear={
            filters.amountMin !== null || filters.amountMax !== null
              ? () => {
                  set({ amountMin: null, amountMax: null });
                }
              : undefined
          }
        >
          <NumberRange
            label="Amount"
            prefix="$"
            min={filters.amountMin}
            max={filters.amountMax}
            onChange={({ min, max }) => {
              set({ amountMin: min, amountMax: max });
            }}
          />
        </FilterSection>
        <FilterSection
          title="Date"
          onClear={
            filters.from !== null || filters.to !== null
              ? () => {
                  set({ from: null, to: null });
                }
              : undefined
          }
        >
          <DateRange
            label="Date"
            from={filters.from}
            to={filters.to}
            onChange={({ from, to }) => {
              set({ from, to });
            }}
          />
        </FilterSection>
      </FilterSheet>
    </>
  );
}
