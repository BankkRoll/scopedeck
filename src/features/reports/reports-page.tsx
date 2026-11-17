import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Report } from "@/ipc/reports";
import { DataTable } from "@/components/data-table";
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  ReportStateLabel,
  SeverityLabel,
  SyncStatus,
} from "@/components/status";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { formatMoney, formatRelative, humanize } from "@/domain/format";
import { OPEN_STATES, REPORT_STATES, bountyTotal, reportMatches } from "@/domain/reports";
import { columnHelper } from "@/lib/table";
import { ProgramLabel } from "@/features/programs/program-label";
import { useViewAction } from "@/features/shell/view-actions";
import { useReports } from "./use-reports";

const helper = columnHelper<Report>();

const SEVERITY_ORDER: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, none: 1 };

const columns = helper.columns([
  helper.accessor((row) => Number(row.id), {
    id: "id",
    header: "ID",
    size: 90,
    cell: (info) => <span className="font-mono text-faint">#{info.row.original.id}</span>,
  }),
  helper.accessor("title", {
    header: "Title",
    sortFn: "text",
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
  helper.accessor((row) => SEVERITY_ORDER[row.severity?.rating?.toLowerCase() ?? ""] ?? 0, {
    id: "severity",
    header: "Severity",
    size: 110,
    cell: (info) => <SeverityLabel rating={info.row.original.severity?.rating} />,
  }),
  helper.accessor((row) => bountyTotal(row.bounties), {
    id: "bounty",
    header: "Bounty",
    size: 100,
    cell: (info) => (
      <span className="font-mono tabular-nums">
        {info.getValue() > 0 ? formatMoney(info.getValue()) : ""}
      </span>
    ),
  }),
  helper.accessor((row) => row.lastActivityAt ?? row.createdAt ?? "", {
    id: "activity",
    header: "Last activity",
    size: 130,
    cell: (info) => <span className="text-muted">{formatRelative(info.getValue())}</span>,
  }),
]);

export function ReportsPage() {
  const navigate = useNavigate();
  const reports = useReports();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("open");
  const searchRef = useRef<HTMLInputElement>(null);
  useViewAction("refresh", reports.refresh);
  useViewAction(
    "search",
    useCallback(() => searchRef.current?.focus(), []),
  );

  const rows = useMemo(
    () =>
      (reports.data ?? []).filter((report) => {
        const reportState = report.state ?? "";
        const stateMatches =
          state === "all" || (state === "open" ? OPEN_STATES.has(reportState) : reportState === state);
        return stateMatches && reportMatches(report, query);
      }),
    [reports.data, query, state],
  );

  const stateOptions = useMemo(() => {
    const all = reports.data ?? [];
    const count = (match: (state: string) => boolean) =>
      all.filter((report) => match(report.state ?? "")).length;
    const option = (value: string, label: string, total: number) => ({
      value,
      textValue: label,
      label: (
        <span className="flex w-full items-center justify-between gap-6">
          {label}
          <span className="font-mono text-faint tabular-nums">{total}</span>
        </span>
      ),
    });
    return [
      option(
        "open",
        "Open",
        count((value) => OPEN_STATES.has(value)),
      ),
      option("all", "All states", all.length),
      ...REPORT_STATES.map((value) =>
        option(
          value,
          humanize(value),
          count((s) => s === value),
        ),
      ),
    ];
  }, [reports.data]);

  return (
    <>
      <PageHeader
        title="Reports"
        meta={reports.data ? `${rows.length} of ${reports.data.length}` : undefined}
        actions={
          <SyncStatus syncedAt={reports.syncedAt} syncing={reports.syncing} onRefresh={reports.refresh} />
        }
      />
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-2.5">
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search reports"
          placeholder="Search by title, #id, program or weakness"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="max-w-sm"
        />
        <Select
          aria-label="Filter by state"
          value={state}
          onValueChange={setState}
          options={stateOptions}
          className="w-56"
        />
      </div>
      {reports.syncError ? <ErrorNotice error={reports.syncError} className="mx-5 mt-3" /> : null}
      <DataTable
        label="Reports"
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        initialSorting={[{ id: "activity", desc: true }]}
        onActivate={(row) => void navigate({ to: "/reports/$id", params: { id: row.id } })}
        empty={
          reports.loadingCache ? (
            "Loading reports"
          ) : (
            <EmptyState title={reports.data?.length ? "No reports match" : "No reports yet"}>
              {reports.data?.length
                ? "Change the state filter or search."
                : "Reports you submit appear here after a sync."}
            </EmptyState>
          )
        }
      />
    </>
  );
}
