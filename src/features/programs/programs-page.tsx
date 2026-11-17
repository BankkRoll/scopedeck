import { useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ProgramRow } from "@/ipc/programs";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorNotice, PageHeader, SyncStatus } from "@/components/status";
import { Input } from "@/components/ui/field";
import { formatMoney, humanize } from "@/domain/format";
import { cn } from "@/lib/cn";
import { columnHelper } from "@/lib/table";
import { useViewAction } from "@/features/shell/view-actions";
import { usePinProgram, usePrograms, useProgramSearch } from "./use-programs";

type Filter = "all" | "pinned" | "bounties" | "open";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pinned", label: "Pinned" },
  { value: "bounties", label: "Bounties" },
  { value: "open", label: "Accepting reports" },
];

const helper = columnHelper<ProgramRow>();

function PinButton({ row }: { row: ProgramRow }) {
  const pin = usePinProgram();
  return (
    <button
      type="button"
      aria-label={row.pinned ? `Unpin ${row.name}` : `Pin ${row.name}`}
      aria-pressed={row.pinned}
      onClick={(event) => {
        event.stopPropagation();
        pin.mutate({ handle: row.handle, pinned: !row.pinned });
      }}
      className="grid size-6 place-items-center rounded-sm text-faint hover:bg-hover hover:text-ink"
    >
      <Star className={cn("size-3.5", row.pinned && "fill-ink text-ink")} />
    </button>
  );
}

const columns = helper.columns([
  helper.accessor("pinned", {
    header: "",
    size: 40,
    enableSorting: false,
    cell: (info) => <PinButton row={info.row.original} />,
  }),
  helper.accessor("name", {
    header: "Program",
    sortFn: "text",
    cell: (info) => (
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-ink">{info.getValue()}</span>
        <span className="truncate font-mono text-faint">{info.row.original.handle}</span>
      </span>
    ),
  }),
  helper.accessor((row) => row.state ?? "", {
    id: "visibility",
    header: "Visibility",
    size: 120,
    cell: (info) => <span className="text-muted">{humanize(info.getValue().replace(/_mode$/, ""))}</span>,
  }),
  helper.accessor((row) => row.submissionState ?? "", {
    id: "submission",
    header: "Submissions",
    size: 120,
    cell: (info) => <span className="text-muted">{humanize(info.getValue())}</span>,
  }),
  helper.accessor((row) => (row.offersBounties ? 1 : 0), {
    id: "bounties",
    header: "Bounties",
    size: 100,
    cell: (info) => <span className="text-muted">{info.getValue() ? "Yes" : "No"}</span>,
  }),
  helper.accessor((row) => row.numberOfReportsForUser ?? 0, {
    id: "reports",
    header: "My reports",
    size: 110,
    cell: (info) => <span className="font-mono text-muted tabular-nums">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.bountyEarnedForUser ?? 0, {
    id: "earned",
    header: "Earned",
    size: 110,
    cell: (info) => (
      <span className="font-mono text-muted tabular-nums">
        {info.getValue() > 0 ? formatMoney(info.getValue(), info.row.original.currency ?? "USD") : ""}
      </span>
    ),
  }),
]);

export function ProgramsPage() {
  const navigate = useNavigate();
  const programs = usePrograms();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const search = useProgramSearch(query);
  const searchRef = useRef<HTMLInputElement>(null);

  useViewAction("refresh", programs.refresh);
  useViewAction(
    "search",
    useCallback(() => searchRef.current?.focus(), []),
  );

  const rows = useMemo(() => {
    const all = programs.data ?? [];
    const matches = query.trim() ? search.data : undefined;
    return all
      .filter((row) => !matches || matches.has(row.handle))
      .filter((row) => {
        if (filter === "pinned") return row.pinned;
        if (filter === "bounties") return row.offersBounties === true;
        if (filter === "open") return row.submissionState === "open";
        return true;
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  }, [programs.data, search.data, query, filter]);

  return (
    <>
      <PageHeader
        title="Programs"
        meta={programs.data ? `${rows.length} of ${programs.data.length}` : undefined}
        actions={
          <SyncStatus syncedAt={programs.syncedAt} syncing={programs.syncing} onRefresh={programs.refresh} />
        }
      />
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-2.5">
        <Input
          ref={searchRef}
          type="search"
          aria-label="Search programs and assets"
          placeholder="Search programs and assets"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="max-w-xs"
        />
        <div role="radiogroup" aria-label="Filter programs" className="flex gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={filter === option.value}
              onClick={() => {
                setFilter(option.value);
              }}
              className="h-7 rounded-md px-2.5 text-[13px] text-muted hover:bg-hover hover:text-ink aria-checked:bg-raised aria-checked:text-ink"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {programs.syncError ? <ErrorNotice error={programs.syncError} className="mx-5 mt-3" /> : null}
      <DataTable
        label="Programs"
        data={rows}
        columns={columns}
        getRowId={(row) => row.handle}
        onActivate={(row) => void navigate({ to: "/programs/$handle", params: { handle: row.handle } })}
        empty={
          programs.loadingCache || (programs.syncing && !programs.data?.length) ? (
            "Loading programs"
          ) : (
            <EmptyState title={query ? "No programs or assets match" : "No programs yet"}>
              {query
                ? "Search covers program names, handles and asset identifiers."
                : "Sync to load the programs your token can see."}
            </EmptyState>
          )
        }
      />
    </>
  );
}
