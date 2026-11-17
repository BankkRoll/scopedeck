import { useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";
import type { ProgramRow } from "@/ipc/programs";
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
import { ProgramAvatar } from "@/components/program-avatar";
import { EmptyState, ErrorNotice, PageHeader, SyncStatus } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { ViewToolbar } from "@/components/view-toolbar";
import { sortStateSchema, viewModeSchema, type SortState } from "@/lib/view-state";
import { formatDate, formatMoney, humanize } from "@/domain/format";
import {
  EMPTY_PROGRAM_FILTERS,
  PERK_LABELS,
  activeProgramFilterCount,
  programFiltersSchema,
  programMatches,
  sortPrograms,
  type ProgramFilters,
  type ProgramPerk,
} from "@/domain/program-filters";
import { cn } from "@/lib/cn";
import { usePersistedState } from "@/lib/persisted-state";
import { columnHelper } from "@/lib/table";
import { useViewAction } from "@/features/shell/view-actions";
import { usePinProgram, usePrograms, useProgramSearch } from "./use-programs";

const SORT_OPTIONS = [
  { value: "default", label: "Recommended" },
  { value: "name", label: "Name" },
  { value: "launched", label: "Launch date" },
  { value: "reports", label: "My reports" },
  { value: "earned", label: "Earned" },
];

const DEFAULT_SORT: SortState = { id: "default", desc: false };

function visibilityLabel(state: string): string {
  if (state === "soft_launched") return "Private";
  return humanize(state.replace(/_mode$/, "")) || "Unknown";
}

function SubmissionState({ state }: { state: string }) {
  const tone = state === "open" ? "bg-success" : state === "paused" ? "bg-warning" : "bg-line-strong";
  return (
    <span className={cn("inline-flex items-center gap-1.5", state === "open" ? "text-ink" : "text-muted")}>
      <span className={cn("size-1.5 shrink-0 rounded-full", tone)} aria-hidden />
      {state ? humanize(state) : "Unknown"}
    </span>
  );
}

function TypeBadge({ bounty }: { bounty: boolean }) {
  return bounty ? <Badge className="border-accent/40 text-link">Bounty</Badge> : <Badge>VDP</Badge>;
}

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
      className="grid size-6 shrink-0 place-items-center rounded-sm text-faint hover:bg-hover hover:text-ink"
    >
      <Star className={cn("size-3.5", row.pinned && "fill-warning text-warning")} />
    </button>
  );
}

function Dash() {
  return <span className="text-faint">–</span>;
}

const helper = columnHelper<ProgramRow>();

const columns = helper.columns([
  helper.accessor("pinned", {
    header: "",
    size: 40,
    cell: (info) => <PinButton row={info.row.original} />,
  }),
  helper.accessor("name", {
    header: "Program",
    size: 420,
    cell: (info) => (
      <span className="flex min-w-0 items-center gap-2.5">
        <ProgramAvatar name={info.getValue()} src={info.row.original.profilePicture} />
        <span className="truncate text-ink">{info.getValue()}</span>
        <span className="truncate font-mono text-[12px] text-faint">{info.row.original.handle}</span>
      </span>
    ),
  }),
  helper.accessor((row) => (row.offersBounties ? 1 : 0), {
    id: "type",
    header: "Type",
    size: 90,
    cell: (info) => <TypeBadge bounty={info.getValue() === 1} />,
  }),
  helper.accessor((row) => row.submissionState ?? "", {
    id: "submission",
    header: "Submissions",
    size: 120,
    cell: (info) => <SubmissionState state={info.getValue()} />,
  }),
  helper.accessor((row) => row.startedAcceptingAt ?? "", {
    id: "launched",
    header: "Launched",
    size: 120,
    cell: (info) =>
      info.getValue() ? <span className="text-muted">{formatDate(info.getValue())}</span> : <Dash />,
  }),
  helper.accessor((row) => row.numberOfReportsForUser ?? 0, {
    id: "reports",
    header: "My reports",
    size: 100,
    cell: (info) =>
      info.getValue() ? <span className="font-mono text-ink tabular-nums">{info.getValue()}</span> : <Dash />,
  }),
  helper.accessor((row) => row.bountyEarnedForUser ?? 0, {
    id: "earned",
    header: "Earned",
    size: 110,
    cell: (info) =>
      info.getValue() > 0 ? (
        <span className="font-mono text-success tabular-nums">
          {formatMoney(info.getValue(), info.row.original.currency ?? "USD")}
        </span>
      ) : (
        <Dash />
      ),
  }),
]);

const SORTABLE = ["name", "launched", "reports", "earned"];

function ProgramCard({ row, onOpen }: { row: ProgramRow; onOpen: () => void }) {
  const perks = (Object.keys(PERK_LABELS) as ProgramPerk[]).filter((perk) => row[perk] === true);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={cardClass}
    >
      <div className="flex items-start gap-3">
        <ProgramAvatar name={row.name} src={row.profilePicture} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-ink">{row.name}</div>
          <div className="truncate font-mono text-[12px] text-faint">{row.handle}</div>
        </div>
        <PinButton row={row} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TypeBadge bounty={row.offersBounties === true} />
        <Badge>
          <SubmissionState state={row.submissionState ?? ""} />
        </Badge>
        {row.state && row.state !== "public_mode" ? <Badge>{visibilityLabel(row.state)}</Badge> : null}
      </div>
      <p className="line-clamp-1 min-h-5 text-[12px] text-faint">
        {perks.length ? perks.map((perk) => PERK_LABELS[perk]).join(" · ") : "No extra program perks"}
      </p>
      <dl className="mt-auto grid grid-cols-3 border-t border-line pt-3 text-[12px]">
        <div>
          <dt className="text-faint">Launched</dt>
          <dd className="text-muted">{row.startedAcceptingAt ? row.startedAcceptingAt.slice(0, 4) : "–"}</dd>
        </div>
        <div>
          <dt className="text-faint">My reports</dt>
          <dd className="font-mono text-muted tabular-nums">
            {(row.numberOfReportsForUser ?? 0) > 0 ? row.numberOfReportsForUser : "–"}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Earned</dt>
          <dd
            className={cn("font-mono tabular-nums", row.bountyEarnedForUser ? "text-success" : "text-muted")}
          >
            {row.bountyEarnedForUser ? formatMoney(row.bountyEarnedForUser, row.currency ?? "USD") : "–"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function countBy(rows: readonly ProgramRow[], key: (row: ProgramRow) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return counts;
}

export function ProgramsPage() {
  const navigate = useNavigate();
  const programs = usePrograms();
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = usePersistedState("programs.mode", viewModeSchema, "cards");
  const [sort, setSort] = usePersistedState("programs.sort", sortStateSchema, DEFAULT_SORT);
  const [filters, setFilters] = usePersistedState(
    "programs.filters",
    programFiltersSchema,
    EMPTY_PROGRAM_FILTERS,
  );
  const search = useProgramSearch(query);

  useViewAction("refresh", programs.refresh);

  const all = useMemo(() => programs.data ?? [], [programs.data]);
  const rows = useMemo(() => {
    const matches = query.trim() ? search.data : undefined;
    const kept = all.filter((row) => (!matches || matches.has(row.handle)) && programMatches(row, filters));
    return sortPrograms(kept, sort.id, sort.desc);
  }, [all, search.data, query, filters, sort]);

  const set = (patch: Partial<ProgramFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };
  const activeCount = activeProgramFilterCount(filters);
  const submissionCounts = useMemo(() => countBy(all, (row) => row.submissionState ?? ""), [all]);
  const visibilityCounts = useMemo(() => countBy(all, (row) => row.state ?? ""), [all]);
  const open = (row: ProgramRow) =>
    void navigate({ to: "/programs/$handle", params: { handle: row.handle } });

  const chips: ActiveFilter[] = [
    ...filters.types.map((type) => ({
      key: `type:${type}`,
      label: type === "bounty" ? "Bounty" : "VDP",
      onRemove: () => {
        set({ types: filters.types.filter((value) => value !== type) });
      },
    })),
    ...filters.submission.map((state) => ({
      key: `submission:${state}`,
      label: `Submissions: ${humanize(state)}`,
      onRemove: () => {
        set({ submission: filters.submission.filter((value) => value !== state) });
      },
    })),
    ...filters.visibility.map((state) => ({
      key: `visibility:${state}`,
      label: visibilityLabel(state),
      onRemove: () => {
        set({ visibility: filters.visibility.filter((value) => value !== state) });
      },
    })),
    ...filters.perks.map((perk) => ({
      key: `perk:${perk}`,
      label: PERK_LABELS[perk],
      onRemove: () => {
        set({ perks: filters.perks.filter((value) => value !== perk) });
      },
    })),
    ...(filters.reported === "any"
      ? []
      : [
          {
            key: "reported",
            label: filters.reported === "yes" ? "Reported to" : "Not reported to yet",
            onRemove: () => {
              set({ reported: "any" });
            },
          },
        ]),
    ...(filters.pinnedOnly
      ? [
          {
            key: "pinned",
            label: "Pinned",
            onRemove: () => {
              set({ pinnedOnly: false });
            },
          },
        ]
      : []),
    ...(filters.earnedMin !== null || filters.earnedMax !== null
      ? [
          {
            key: "earned",
            label: `Earned ${filters.earnedMin === null ? "" : formatMoney(filters.earnedMin)}–${
              filters.earnedMax === null ? "" : formatMoney(filters.earnedMax)
            }`,
            onRemove: () => {
              set({ earnedMin: null, earnedMax: null });
            },
          },
        ]
      : []),
    ...(filters.launchedFrom !== null || filters.launchedTo !== null
      ? [
          {
            key: "launched",
            label: `Launched ${filters.launchedFrom ?? ""}–${filters.launchedTo ?? ""}`,
            onRemove: () => {
              set({ launchedFrom: null, launchedTo: null });
            },
          },
        ]
      : []),
  ];

  const empty =
    programs.loadingCache || (programs.syncing && all.length === 0) ? (
      "Loading programs"
    ) : (
      <EmptyState title={query || activeCount ? "No programs match" : "No programs yet"}>
        {query || activeCount
          ? "Search covers program names, handles and asset identifiers. Try removing a filter."
          : "Sync to load the programs your token can see."}
      </EmptyState>
    );

  return (
    <>
      <PageHeader
        title="Programs"
        meta={programs.data ? `${rows.length.toLocaleString()} of ${all.length.toLocaleString()}` : undefined}
        actions={
          <SyncStatus syncedAt={programs.syncedAt} syncing={programs.syncing} onRefresh={programs.refresh} />
        }
      />
      <ViewToolbar
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search programs and assets",
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
          setFilters(EMPTY_PROGRAM_FILTERS);
        }}
      />
      {programs.syncError ? <ErrorNotice error={programs.syncError} className="mx-5 mt-3" /> : null}
      {mode === "list" ? (
        <DataTable
          label="Programs"
          data={rows}
          columns={columns}
          getRowId={(row) => row.handle}
          sort={sort}
          onSortChange={setSort}
          sortableIds={SORTABLE}
          onActivate={open}
          empty={empty}
        />
      ) : (
        <CardGrid
          label="Programs"
          items={rows}
          getKey={(row) => row.handle}
          cardHeight={196}
          minCardWidth={280}
          empty={empty}
          renderCard={(row) => (
            <ProgramCard
              row={row}
              onOpen={() => {
                open(row);
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
          setFilters(EMPTY_PROGRAM_FILTERS);
        }}
      >
        <FilterSection
          title="Program type"
          onClear={
            filters.types.length
              ? () => {
                  set({ types: [] });
                }
              : undefined
          }
        >
          <ChipGroup
            label="Program type"
            value={filters.types}
            onChange={(types) => {
              set({ types });
            }}
            options={[
              { value: "bounty", label: "Bounty", count: all.filter((row) => row.offersBounties).length },
              { value: "vdp", label: "VDP", count: all.filter((row) => !row.offersBounties).length },
            ]}
          />
        </FilterSection>
        <FilterSection
          title="Submissions"
          onClear={
            filters.submission.length
              ? () => {
                  set({ submission: [] });
                }
              : undefined
          }
        >
          <ChipGroup
            label="Submissions"
            value={filters.submission}
            onChange={(submission) => {
              set({ submission });
            }}
            options={[...submissionCounts].map(([value, count]) => ({
              value,
              label: value ? humanize(value) : "Unknown",
              count,
            }))}
          />
        </FilterSection>
        <FilterSection
          title="Visibility"
          onClear={
            filters.visibility.length
              ? () => {
                  set({ visibility: [] });
                }
              : undefined
          }
        >
          <ChipGroup
            label="Visibility"
            value={filters.visibility}
            onChange={(visibility) => {
              set({ visibility });
            }}
            options={[...visibilityCounts].map(([value, count]) => ({
              value,
              label: visibilityLabel(value),
              count,
            }))}
          />
        </FilterSection>
        <FilterSection
          title="Perks"
          description="Programs must offer every selected perk."
          onClear={
            filters.perks.length
              ? () => {
                  set({ perks: [] });
                }
              : undefined
          }
        >
          <ChipGroup
            label="Perks"
            value={filters.perks}
            onChange={(perks) => {
              set({ perks });
            }}
            options={(Object.keys(PERK_LABELS) as ProgramPerk[]).map((perk) => ({
              value: perk,
              label: PERK_LABELS[perk],
              count: all.filter((row) => row[perk] === true).length,
            }))}
          />
        </FilterSection>
        <FilterSection title="Your history">
          <ChipGroup
            label="Reporting history"
            value={filters.reported === "any" ? [] : [filters.reported]}
            onChange={(values) => {
              set({ reported: values.at(-1) ?? "any" });
            }}
            options={[
              { value: "yes", label: "Reported to" },
              { value: "no", label: "Not reported to yet" },
            ]}
          />
          <ToggleFilter
            label="Pinned only"
            checked={filters.pinnedOnly}
            onChange={(pinnedOnly) => {
              set({ pinnedOnly });
            }}
          />
        </FilterSection>
        <FilterSection
          title="Earned from program"
          onClear={
            filters.earnedMin !== null || filters.earnedMax !== null
              ? () => {
                  set({ earnedMin: null, earnedMax: null });
                }
              : undefined
          }
        >
          <NumberRange
            label="Earned"
            prefix="$"
            min={filters.earnedMin}
            max={filters.earnedMax}
            onChange={({ min, max }) => {
              set({ earnedMin: min, earnedMax: max });
            }}
          />
        </FilterSection>
        <FilterSection
          title="Launch date"
          onClear={
            filters.launchedFrom !== null || filters.launchedTo !== null
              ? () => {
                  set({ launchedFrom: null, launchedTo: null });
                }
              : undefined
          }
        >
          <DateRange
            label="Launch date"
            from={filters.launchedFrom}
            to={filters.launchedTo}
            onChange={({ from, to }) => {
              set({ launchedFrom: from, launchedTo: to });
            }}
          />
        </FilterSection>
      </FilterSheet>
    </>
  );
}
