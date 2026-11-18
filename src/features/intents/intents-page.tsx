import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Paperclip } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { toAppError } from "@/ipc/errors";
import { intentsList, type IntentPhase, type ReportIntent } from "@/ipc/intents";
import { CardGrid, cardClass } from "@/components/card-grid";
import { DataTable } from "@/components/data-table";
import {
  ActiveFilters,
  ChipGroup,
  DateRange,
  FilterSection,
  FilterSheet,
  ToggleFilter,
  type ActiveFilter,
} from "@/components/filters";
import { EmptyState, ErrorNotice, PageHeader, SyncStatus } from "@/components/status";
import { Dialog } from "@/components/ui/dialog";
import { ViewToolbar } from "@/components/view-toolbar";
import { formatRelative, humanize } from "@/domain/format";
import { cn } from "@/lib/cn";
import { usePersistedState } from "@/lib/persisted-state";
import { columnHelper } from "@/lib/table";
import { sortStateSchema, viewModeSchema, type SortState } from "@/lib/view-state";
import { useViewAction } from "@/features/shell/view-actions";
import { queryKeys } from "@/query/keys";
import { ProgramLabelById } from "@/features/programs/program-label";
import { IntentTracker } from "./intent-tracker";

const PHASES: IntentPhase[] = ["analyzing", "needsInput", "ready", "submitted", "failed"];

const PHASE_TONE: Record<IntentPhase, string> = {
  analyzing: "bg-accent",
  needsInput: "bg-warning",
  ready: "bg-success",
  submitted: "bg-sev-none",
  failed: "bg-danger",
};

const filtersSchema = z.object({
  phases: z.array(z.enum(["analyzing", "needsInput", "ready", "submitted", "failed"])).default([]),
  bugClasses: z.array(z.string()).default([]),
  withFiles: z.boolean().default(false),
  updatedFrom: z.string().nullable().default(null),
  updatedTo: z.string().nullable().default(null),
});
type IntentFilters = z.infer<typeof filtersSchema>;
const EMPTY_FILTERS: IntentFilters = filtersSchema.parse({});

const SORT_OPTIONS = [
  { value: "updated", label: "Last updated" },
  { value: "created", label: "Created" },
  { value: "title", label: "Title" },
];
const DEFAULT_SORT: SortState = { id: "updated", desc: true };

const compare: Record<string, (a: ReportIntent, b: ReportIntent) => number> = {
  updated: (a, b) => (a.updatedAt ?? a.createdAt ?? "").localeCompare(b.updatedAt ?? b.createdAt ?? ""),
  created: (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  title: (a, b) => titleOf(a).localeCompare(titleOf(b)),
};

function titleOf(intent: ReportIntent): string {
  return (intent.title ?? intent.description).split("\n")[0] ?? "";
}

function phaseLabel(phase: IntentPhase): string {
  return phase === "needsInput" ? "Needs input" : humanize(phase);
}

function PhaseLabel({ phase }: { phase: IntentPhase }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", phase === "submitted" ? "text-muted" : "text-ink")}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", PHASE_TONE[phase])} aria-hidden />
      {phaseLabel(phase)}
    </span>
  );
}

const helper = columnHelper<ReportIntent>();

const columns = helper.columns([
  helper.accessor((row) => titleOf(row), {
    id: "title",
    header: "Intent",
    size: 380,
    cell: (info) => <span className="text-ink">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.programId ?? "", {
    id: "program",
    header: "Program",
    size: 200,
    cell: (info) => <ProgramLabelById id={info.getValue() || null} />,
  }),
  helper.accessor("phase", {
    header: "Status",
    size: 130,
    cell: (info) => <PhaseLabel phase={info.getValue()} />,
  }),
  helper.accessor((row) => row.metadata.bugClass ?? "", {
    id: "bugClass",
    header: "Bug class",
    size: 180,
    cell: (info) => <span className="text-muted">{info.getValue() || "–"}</span>,
  }),
  helper.accessor((row) => row.attachments.length, {
    id: "files",
    header: "Files",
    size: 70,
    cell: (info) => <span className="font-mono text-muted tabular-nums">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.updatedAt ?? row.createdAt ?? "", {
    id: "updated",
    header: "Updated",
    size: 130,
    cell: (info) => <span className="text-muted">{formatRelative(info.getValue())}</span>,
  }),
]);

function IntentCard({ intent, onOpen }: { intent: ReportIntent; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={cardClass}>
      <div className="flex w-full items-center justify-between gap-3 text-[13px]">
        <ProgramLabelById id={intent.programId} />
        <span className="shrink-0 font-mono text-[12px] text-faint">#{intent.id}</span>
      </div>
      <p className="line-clamp-2 min-h-10 text-[14px] leading-5 font-medium text-ink">{titleOf(intent)}</p>
      <p className="w-full truncate font-mono text-[12px] text-faint">
        {intent.metadata.vulnerableUrl ?? intent.metadata.bugClass ?? "No analysis yet"}
      </p>
      <div className="mt-auto flex w-full items-center justify-between gap-3 border-t border-line pt-3 text-[12px] text-faint">
        <PhaseLabel phase={intent.phase} />
        <span className="ml-auto inline-flex items-center gap-1">
          <Paperclip className="size-3" />
          {intent.attachments.length}
        </span>
        <span>{formatRelative(intent.updatedAt ?? intent.createdAt)}</span>
      </div>
    </button>
  );
}

export function IntentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = usePersistedState("intents.mode", viewModeSchema, "cards");
  const [sort, setSort] = usePersistedState("intents.sort", sortStateSchema, DEFAULT_SORT);
  const [filters, setFilters] = usePersistedState("intents.filters", filtersSchema, EMPTY_FILTERS);
  const intents = useQuery({ queryKey: queryKeys.intents, queryFn: intentsList });
  const { refetch } = intents;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  useViewAction("refresh", refresh);

  const all = useMemo(() => intents.data ?? [], [intents.data]);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const by = compare[sort.id] ?? compare.updated;
    const direction = sort.desc ? -1 : 1;
    return all
      .filter((intent) => {
        if (
          needle &&
          !`${intent.id} ${intent.title ?? ""} ${intent.description}`.toLowerCase().includes(needle)
        )
          return false;
        if (filters.phases.length && !filters.phases.includes(intent.phase)) return false;
        if (filters.bugClasses.length && !filters.bugClasses.includes(intent.metadata.bugClass ?? ""))
          return false;
        if (filters.withFiles && intent.attachments.length === 0) return false;
        const updated = (intent.updatedAt ?? intent.createdAt)?.slice(0, 10) ?? null;
        if (filters.updatedFrom && (!updated || updated < filters.updatedFrom)) return false;
        if (filters.updatedTo && (!updated || updated > filters.updatedTo)) return false;
        return true;
      })
      .toSorted((a, b) => (by ? direction * by(a, b) : 0));
  }, [all, query, filters, sort]);

  const set = (patch: Partial<IntentFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  };
  const activeCount = [
    filters.phases.length > 0,
    filters.bugClasses.length > 0,
    filters.withFiles,
    filters.updatedFrom !== null || filters.updatedTo !== null,
  ].filter(Boolean).length;
  const bugClasses = [...new Set(all.map((intent) => intent.metadata.bugClass ?? "").filter(Boolean))].sort();

  const chips: ActiveFilter[] = [
    ...filters.phases.map((phase) => ({
      key: `phase:${phase}`,
      label: phaseLabel(phase),
      onRemove: () => {
        set({ phases: filters.phases.filter((value) => value !== phase) });
      },
    })),
    ...filters.bugClasses.map((bugClass) => ({
      key: `class:${bugClass}`,
      label: bugClass,
      onRemove: () => {
        set({ bugClasses: filters.bugClasses.filter((value) => value !== bugClass) });
      },
    })),
    ...(filters.withFiles
      ? [
          {
            key: "files",
            label: "With attachments",
            onRemove: () => {
              set({ withFiles: false });
            },
          },
        ]
      : []),
    ...(filters.updatedFrom !== null || filters.updatedTo !== null
      ? [
          {
            key: "updated",
            label: `Updated ${filters.updatedFrom ?? ""}–${filters.updatedTo ?? ""}`,
            onRemove: () => {
              set({ updatedFrom: null, updatedTo: null });
            },
          },
        ]
      : []),
  ];

  const empty = intents.isPending ? (
    "Loading report intents"
  ) : (
    <EmptyState title={all.length ? "No intents match" : "No report intents"}>
      {all.length
        ? "Change a filter or search."
        : "Intents are created when you submit a draft with attachments to a program that has the Report Assistant."}
    </EmptyState>
  );
  const openIntent = (intent: ReportIntent) => {
    setSelected(intent.id);
  };

  return (
    <>
      <PageHeader
        title="Report intents"
        meta={intents.data ? `${rows.length} of ${all.length}` : undefined}
        actions={
          <SyncStatus
            syncedAt={intents.dataUpdatedAt ? new Date(intents.dataUpdatedAt).toISOString() : null}
            syncing={intents.isFetching}
            onRefresh={refresh}
          />
        }
      />
      <ViewToolbar
        search={{ value: query, onChange: setQuery, placeholder: "Search intents" }}
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
      {intents.isError ? <ErrorNotice error={toAppError(intents.error)} className="mx-5 mt-3" /> : null}
      {mode === "list" ? (
        <DataTable
          label="Report intents"
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          sort={sort}
          onSortChange={setSort}
          sortableIds={["title", "updated"]}
          onActivate={openIntent}
          empty={empty}
        />
      ) : (
        <CardGrid
          label="Report intents"
          items={rows}
          getKey={(intent) => intent.id}
          cardHeight={168}
          minCardWidth={300}
          empty={empty}
          renderCard={(intent) => (
            <IntentCard
              intent={intent}
              onOpen={() => {
                openIntent(intent);
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
          setFilters(EMPTY_FILTERS);
        }}
      >
        <FilterSection
          title="Status"
          onClear={
            filters.phases.length
              ? () => {
                  set({ phases: [] });
                }
              : undefined
          }
        >
          <ChipGroup
            label="Status"
            value={filters.phases}
            onChange={(phases) => {
              set({ phases });
            }}
            options={PHASES.map((phase) => ({
              value: phase,
              label: <PhaseLabel phase={phase} />,
              count: all.filter((intent) => intent.phase === phase).length,
            }))}
          />
        </FilterSection>
        {bugClasses.length ? (
          <FilterSection
            title="Bug class"
            onClear={
              filters.bugClasses.length
                ? () => {
                    set({ bugClasses: [] });
                  }
                : undefined
            }
          >
            <ChipGroup
              label="Bug class"
              value={filters.bugClasses}
              onChange={(values) => {
                set({ bugClasses: values });
              }}
              options={bugClasses.map((bugClass) => ({
                value: bugClass,
                label: bugClass,
                count: all.filter((intent) => intent.metadata.bugClass === bugClass).length,
              }))}
            />
          </FilterSection>
        ) : null}
        <FilterSection title="Attachments">
          <ToggleFilter
            label="With attachments only"
            checked={filters.withFiles}
            onChange={(withFiles) => {
              set({ withFiles });
            }}
          />
        </FilterSection>
        <FilterSection
          title="Last updated"
          onClear={
            filters.updatedFrom !== null || filters.updatedTo !== null
              ? () => {
                  set({ updatedFrom: null, updatedTo: null });
                }
              : undefined
          }
        >
          <DateRange
            label="Last updated"
            from={filters.updatedFrom}
            to={filters.updatedTo}
            onChange={({ from, to }) => {
              set({ updatedFrom: from, updatedTo: to });
            }}
          />
        </FilterSection>
      </FilterSheet>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Report intent"
        className="w-[min(760px,calc(100vw-32px))]"
      >
        {selected ? (
          <IntentTracker
            intentId={selected}
            onSubmitted={(reportId) => {
              setSelected(null);
              toast.success(reportId ? `Report #${reportId} submitted` : "Report submitted");
              void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cached });
              if (reportId) void navigate({ to: "/reports/$id", params: { id: reportId } });
            }}
            onDeleted={() => {
              setSelected(null);
              toast("Report intent deleted");
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
