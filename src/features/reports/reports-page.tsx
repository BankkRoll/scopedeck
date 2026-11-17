import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { Report } from "@/ipc/reports";
import { CardGrid, cardClass } from "@/components/card-grid";
import { DataTable } from "@/components/data-table";
import {
  ActiveFilters,
  ChipGroup,
  DateRange,
  FilterSection,
  FilterSheet,
  NumberRange,
  ToggleFilter,
  type ActiveFilter,
} from "@/components/filters";
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  ReportStateLabel,
  SeverityLabel,
  SyncStatus,
} from "@/components/status";
import { ViewToolbar } from "@/components/view-toolbar";
import { formatMoney, formatRelative, humanize } from "@/domain/format";
import {
  DEFAULT_REPORT_FILTERS,
  NO_REPORT_FILTERS,
  activeReportFilterCount,
  reportFiltersSchema,
  reportPassesFilters,
  severityKey,
  sortReports,
  type ReportFilters,
} from "@/domain/report-filters";
import { REPORT_STATES, bountyTotal, reportMatches } from "@/domain/reports";
import { usePersistedState } from "@/lib/persisted-state";
import { columnHelper } from "@/lib/table";
import { sortStateSchema, viewModeSchema, type SortState } from "@/lib/view-state";
import { ProgramLabel } from "@/features/programs/program-label";
import { useProgramLookup } from "@/features/programs/use-programs";
import { useViewAction } from "@/features/shell/view-actions";
import { useReports } from "./use-reports";

const SORT_OPTIONS = [
  { value: "activity", label: "Last activity" },
  { value: "submitted", label: "Submitted" },
  { value: "severity", label: "Severity" },
  { value: "bounty", label: "Bounty" },
  { value: "title", label: "Title" },
  { value: "id", label: "Report ID" },
];

const DEFAULT_SORT: SortState = { id: "activity", desc: true };
const SEVERITIES = ["critical", "high", "medium", "low", "none", "unrated"];

const helper = columnHelper<Report>();

const columns = helper.columns([
  helper.accessor("id", {
    header: "ID",
    size: 90,
    cell: (info) => <span className="font-mono text-faint">#{info.getValue()}</span>,
  }),
  helper.accessor("title", {
    header: "Title",
    size: 360,
    cell: (info) => <span className="text-ink">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.program?.handle ?? "", {
    id: "program",
    header: "Program",
    size: 190,
    cell: (info) => <ProgramLabel handle={info.getValue()} />,
  }),
  helper.accessor((row) => row.state ?? "", {
    id: "state",
    header: "State",
    size: 150,
    cell: (info) => <ReportStateLabel state={info.getValue()} />,
  }),
  helper.accessor((row) => severityKey(row), {
    id: "severity",
    header: "Severity",
    size: 110,
    cell: (info) => <SeverityLabel rating={info.row.original.severity?.rating} />,
  }),
  helper.accessor((row) => bountyTotal(row.bounties), {
    id: "bounty",
    header: "Bounty",
    size: 100,
    cell: (info) =>
      info.getValue() > 0 ? (
        <span className="font-mono text-success tabular-nums">{formatMoney(info.getValue())}</span>
      ) : (
        <span className="text-faint">–</span>
      ),
  }),
  helper.accessor((row) => row.lastActivityAt ?? row.createdAt ?? "", {
    id: "activity",
    header: "Last activity",
    size: 130,
    cell: (info) => <span className="text-muted">{formatRelative(info.getValue())}</span>,
  }),
]);

const SORTABLE = ["id", "title", "severity", "bounty", "activity"];

function ReportCard({ report, onOpen }: { report: Report; onOpen: () => void }) {
  const bounty = bountyTotal(report.bounties);
  return (
    <button type="button" onClick={onOpen} className={cardClass}>
      <div className="flex w-full items-center justify-between gap-3 text-[12px]">
        <ProgramLabel handle={report.program?.handle} />
        <span className="shrink-0 font-mono text-faint">#{report.id}</span>
      </div>
      <p className="line-clamp-2 min-h-10 text-[14px] leading-5 font-medium text-ink">{report.title}</p>
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <ReportStateLabel state={report.state} />
        <SeverityLabel rating={report.severity?.rating} />
      </div>
      <div className="mt-auto flex w-full items-center justify-between gap-3 border-t border-line pt-3 text-[12px]">
        <span className="min-w-0 truncate text-faint">{report.weakness?.name ?? "No weakness"}</span>
        <span className="shrink-0 text-faint">
          {bounty > 0 ? (
            <span className="mr-2 font-mono text-success tabular-nums">{formatMoney(bounty)}</span>
          ) : null}
          {formatRelative(report.lastActivityAt ?? report.createdAt)}
        </span>
      </div>
    </button>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const reports = useReports();
  const lookup = useProgramLookup();
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = usePersistedState("reports.mode", viewModeSchema, "cards");
  const [sort, setSort] = usePersistedState("reports.sort", sortStateSchema, DEFAULT_SORT);
  const [filters, setFilters] = usePersistedState(
    "reports.filters",
    reportFiltersSchema,
    DEFAULT_REPORT_FILTERS,
  );
  useViewAction("refresh", reports.refresh);

  const all = useMemo(() => reports.data ?? [], [reports.data]);
  const rows = useMemo(
    () =>
      sortReports(
        all.filter((report) => reportMatches(report, query) && reportPassesFilters(report, filters)),
        sort.id,
        sort.desc,
      ),
    [all, query, filters, sort],
  );

  const set = (patch: Partial<ReportFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };
  const activeCount = activeReportFilterCount(filters);
  const count = (match: (report: Report) => boolean) => all.filter(match).length;
  const programHandles = useMemo(
    () => [...new Set(all.map((report) => report.program?.handle ?? "").filter(Boolean))].sort(),
    [all],
  );
  const open = (report: Report) => void navigate({ to: "/reports/$id", params: { id: report.id } });
  const programName = (handle: string) => lookup.get(handle)?.name ?? handle;

  const chips: ActiveFilter[] = [
    ...(filters.openOnly
      ? [
          {
            key: "open",
            label: "Open only",
            onRemove: () => {
              set({ openOnly: false });
            },
          },
        ]
      : []),
    ...filters.states.map((state) => ({
      key: `state:${state}`,
      label: humanize(state),
      onRemove: () => {
        set({ states: filters.states.filter((value) => value !== state) });
      },
    })),
    ...filters.severities.map((severity) => ({
      key: `severity:${severity}`,
      label: `Severity: ${humanize(severity)}`,
      onRemove: () => {
        set({ severities: filters.severities.filter((value) => value !== severity) });
      },
    })),
    ...filters.programs.map((handle) => ({
      key: `program:${handle}`,
      label: programName(handle),
      onRemove: () => {
        set({ programs: filters.programs.filter((value) => value !== handle) });
      },
    })),
    ...(filters.bountyMin !== null || filters.bountyMax !== null
      ? [
          {
            key: "bounty",
            label: `Bounty ${filters.bountyMin === null ? "" : formatMoney(filters.bountyMin)}–${
              filters.bountyMax === null ? "" : formatMoney(filters.bountyMax)
            }`,
            onRemove: () => {
              set({ bountyMin: null, bountyMax: null });
            },
          },
        ]
      : []),
    ...(filters.submittedFrom !== null || filters.submittedTo !== null
      ? [
          {
            key: "submitted",
            label: `Submitted ${filters.submittedFrom ?? ""}–${filters.submittedTo ?? ""}`,
            onRemove: () => {
              set({ submittedFrom: null, submittedTo: null });
            },
          },
        ]
      : []),
  ];

  const empty = reports.loadingCache ? (
    "Loading reports"
  ) : (
    <EmptyState title={all.length ? "No reports match" : "No reports yet"}>
      {all.length ? "Change a filter or search." : "Reports you submit appear here after a sync."}
    </EmptyState>
  );

  return (
    <>
      <PageHeader
        title="Reports"
        meta={reports.data ? `${rows.length.toLocaleString()} of ${all.length.toLocaleString()}` : undefined}
        actions={
          <SyncStatus syncedAt={reports.syncedAt} syncing={reports.syncing} onRefresh={reports.refresh} />
        }
      />
      <ViewToolbar
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search by title, #id, program or weakness",
        }}
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
          setFilters(NO_REPORT_FILTERS);
        }}
      />
      {reports.syncError ? <ErrorNotice error={reports.syncError} className="mx-5 mt-3" /> : null}
      {mode === "list" ? (
        <DataTable
          label="Reports"
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          sort={sort}
          onSortChange={setSort}
          sortableIds={SORTABLE}
          onActivate={open}
          empty={empty}
        />
      ) : (
        <CardGrid
          label="Reports"
          items={rows}
          getKey={(report) => report.id}
          cardHeight={184}
          minCardWidth={320}
          empty={empty}
          renderCard={(report) => (
            <ReportCard
              report={report}
              onOpen={() => {
                open(report);
              }}
            />
          )}
        />
      )}

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        activeCount={activeCount}
        resultCount={rows.length}
        onReset={() => {
          setFilters(NO_REPORT_FILTERS);
        }}
      >
        <FilterSection title="State">
          <ToggleFilter
            label="Open reports only"
            description="New, triaged, needs more info, pending review and retesting."
            checked={filters.openOnly}
            onChange={(openOnly) => {
              set({ openOnly });
            }}
          />
          <ChipGroup
            label="State"
            value={filters.states}
            onChange={(states) => {
              set({ states });
            }}
            options={REPORT_STATES.map((state) => ({
              value: state,
              label: humanize(state),
              count: count((report) => report.state === state),
            }))}
          />
        </FilterSection>
        <FilterSection
          title="Severity"
          onClear={
            filters.severities.length
              ? () => {
                  set({ severities: [] });
                }
              : undefined
          }
        >
          <ChipGroup
            label="Severity"
            value={filters.severities}
            onChange={(severities) => {
              set({ severities });
            }}
            options={SEVERITIES.map((severity) => ({
              value: severity,
              label: <SeverityLabel rating={severity === "unrated" ? null : severity} />,
              count: count((report) => severityKey(report) === severity),
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
            onChange={(programs) => {
              set({ programs });
            }}
            options={programHandles.map((handle) => ({
              value: handle,
              label: programName(handle),
              count: count((report) => report.program?.handle === handle),
            }))}
          />
        </FilterSection>
        <FilterSection
          title="Bounty awarded"
          onClear={
            filters.bountyMin !== null || filters.bountyMax !== null
              ? () => {
                  set({ bountyMin: null, bountyMax: null });
                }
              : undefined
          }
        >
          <NumberRange
            label="Bounty"
            prefix="$"
            min={filters.bountyMin}
            max={filters.bountyMax}
            onChange={({ min, max }) => {
              set({ bountyMin: min, bountyMax: max });
            }}
          />
        </FilterSection>
        <FilterSection
          title="Submitted"
          onClear={
            filters.submittedFrom !== null || filters.submittedTo !== null
              ? () => {
                  set({ submittedFrom: null, submittedTo: null });
                }
              : undefined
          }
        >
          <DateRange
            label="Submitted"
            from={filters.submittedFrom}
            to={filters.submittedTo}
            onChange={({ from, to }) => {
              set({ submittedFrom: from, submittedTo: to });
            }}
          />
        </FilterSection>
      </FilterSheet>
    </>
  );
}
