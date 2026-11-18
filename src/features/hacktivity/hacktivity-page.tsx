import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toAppError } from "@/ipc/errors";
import type { HacktivityItem } from "@/ipc/hacktivity";
import { savedSearchDelete, savedSearchSave, savedSearchesList } from "@/ipc/workspace";
import { CardGrid } from "@/components/card-grid";
import { ActiveFilters, FilterSheet, type ActiveFilter } from "@/components/filters";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { ViewToolbar } from "@/components/view-toolbar";
import { assetTypeLabel, formatMoney, formatRelative, humanize } from "@/domain/format";
import {
  DEFAULT_BUILDER_STATE,
  EMPTY_FILTERS,
  HACKTIVITY_SORT_FIELDS,
  activeHacktivityFilterCount,
  builderStateSchema,
  filterProblems,
  joinSort,
  queryStringFor,
  splitSort,
  type BuilderState,
  type HacktivityFilters,
} from "@/domain/hacktivity-query";
import { usePersistedState } from "@/lib/persisted-state";
import { viewModeSchema } from "@/lib/view-state";
import { useViewAction } from "@/features/shell/view-actions";
import { queryKeys } from "@/query/keys";
import {
  HACKTIVITY_CARD_HEIGHT,
  HACKTIVITY_ROW_HEIGHT,
  HacktivityCard,
  HacktivityDetailSheet,
  HacktivityRow,
} from "./hacktivity-item";
import { QueryBuilder } from "./query-builder";
import { useHacktivity } from "./use-hacktivity";

function SavedSearches({
  current,
  onLoad,
}: {
  current: BuilderState;
  onLoad: (state: BuilderState) => void;
}) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const saved = useQuery({ queryKey: queryKeys.savedSearches, queryFn: savedSearchesList });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches });
  const save = useMutation({
    mutationFn: () => savedSearchSave(name, current),
    onSuccess: async () => {
      setName("");
      await invalidate();
    },
  });
  const remove = useMutation({ mutationFn: savedSearchDelete, onSuccess: invalidate });
  const valid = (saved.data ?? []).flatMap((search) => {
    const parsed = builderStateSchema.safeParse(search.builder);
    return parsed.success ? [{ ...search, state: parsed.data }] : [];
  });
  const selectedSearch = valid.find((search) => search.id === selected);

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Saved searches"
        className="w-52"
        value={selected}
        placeholder={valid.length ? `Saved searches (${String(valid.length)})` : "No saved searches"}
        disabled={valid.length === 0}
        onValueChange={(id) => {
          setSelected(id);
          const match = valid.find((search) => search.id === id);
          if (match) onLoad(match.state);
        }}
        options={valid.map((search) => ({ value: search.id, label: search.name }))}
      />
      {selectedSearch ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Delete saved search ${selectedSearch.name}`}
          onClick={() => {
            remove.mutate(selectedSearch.id);
            setSelected("");
          }}
        >
          <Trash2 />
        </Button>
      ) : null}
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label htmlFor={nameId} className="sr-only">
          Name for this search
        </label>
        <Input
          id={nameId}
          className="w-40"
          placeholder="Name this search"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Button type="submit" disabled={!name.trim() || save.isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}

function filterChips(state: BuilderState, apply: (state: BuilderState) => void): ActiveFilter[] {
  if (state.mode === "raw") {
    return state.raw.trim()
      ? [
          {
            key: "raw",
            label: <span className="max-w-80 truncate font-mono">{state.raw.trim()}</span>,
            onRemove: () => {
              apply({ ...state, raw: "" });
            },
          },
        ]
      : [];
  }
  const filters = state.filters;
  const patch = (next: Partial<HacktivityFilters>) => () => {
    apply({ ...state, filters: { ...filters, ...next } });
  };
  const text = (value: string, label: string, key: "cwe" | "cve" | "program" | "reporter"): ActiveFilter[] =>
    value.trim() ? [{ key, label: `${label}: ${value.trim()}`, onRemove: patch({ [key]: "" }) }] : [];
  return [
    ...(filters.disclosedOnly
      ? []
      : [{ key: "undisclosed", label: "Including undisclosed", onRemove: patch({ disclosedOnly: true }) }]),
    ...filters.severities.map((severity) => ({
      key: `severity:${severity}`,
      label: `Severity: ${humanize(severity)}`,
      onRemove: patch({ severities: filters.severities.filter((value) => value !== severity) }),
    })),
    ...filters.assetTypes.map((assetType) => ({
      key: `asset:${assetType}`,
      label: assetTypeLabel(assetType),
      onRemove: patch({ assetTypes: filters.assetTypes.filter((value) => value !== assetType) }),
    })),
    ...text(filters.cwe, "CWE", "cwe"),
    ...text(filters.cve, "CVE", "cve"),
    ...text(filters.program, "Program", "program"),
    ...text(filters.reporter, "Reporter", "reporter"),
    ...(filters.minBounty !== null || filters.maxBounty !== null
      ? [
          {
            key: "bounty",
            label: `Bounty ${filters.minBounty === null ? "" : formatMoney(filters.minBounty)}–${
              filters.maxBounty === null ? "" : formatMoney(filters.maxBounty)
            }`,
            onRemove: patch({ minBounty: null, maxBounty: null }),
          },
        ]
      : []),
    ...(filters.disclosedFrom !== null || filters.disclosedTo !== null
      ? [
          {
            key: "disclosed",
            label: `Disclosed ${filters.disclosedFrom ?? ""}–${filters.disclosedTo ?? ""}`,
            onRemove: patch({ disclosedFrom: null, disclosedTo: null }),
          },
        ]
      : []),
    ...(filters.collaboration === "any"
      ? []
      : [
          {
            key: "collaboration",
            label: filters.collaboration === "yes" ? "Collaborations only" : "Solo only",
            onRemove: patch({ collaboration: "any" }),
          },
        ]),
  ];
}

export function HacktivityPage() {
  const [applied, setApplied] = usePersistedState(
    "hacktivity.query",
    builderStateSchema,
    DEFAULT_BUILDER_STATE,
  );
  const [draft, setDraft] = useState<BuilderState>(applied);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mode, setMode] = usePersistedState("hacktivity.mode", viewModeSchema, "cards");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<HacktivityItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const results = useHacktivity(queryStringFor(applied), applied.sort, true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loaded = useMemo(() => results.data?.pages.flatMap((page) => page.page.items) ?? [], [results.data]);
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return loaded;
    return loaded.filter((item) =>
      [item.title, item.programName, item.programHandle, item.reporterUsername, item.cwe, item.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [loaded, query]);
  const fromCache = results.data?.pages.some((page) => page.fromCache) ?? false;
  const fetchedAt = results.data?.pages[0]?.fetchedAt;
  const blocked = draft.mode === "builder" && filterProblems(draft.filters).length > 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = results;

  const select = useCallback((item: HacktivityItem) => {
    setSelected(item);
    setDetailOpen(true);
  }, []);
  const apply = (state: BuilderState) => {
    setApplied(state);
    setDraft(state);
  };
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const virtualizer = useVirtualizer({
    count: items.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => HACKTIVITY_ROW_HEIGHT,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.at(-1)?.index ?? 0;

  useEffect(() => {
    if (mode === "list" && lastIndex >= items.length - 1) loadMore();
  }, [mode, lastIndex, items.length, loadMore]);

  useViewAction(
    "refresh",
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const sort = splitSort(applied.sort);
  const empty =
    results.isFetching && loaded.length === 0 ? (
      "Searching"
    ) : (
      <EmptyState title={loaded.length ? "No loaded reports match" : "No disclosed reports match"}>
        {loaded.length
          ? "The search box only filters results already loaded."
          : "Loosen a filter or switch to a Lucene query."}
      </EmptyState>
    );

  return (
    <>
      <PageHeader
        title="Hacktivity"
        meta={
          fetchedAt
            ? `${fromCache ? "Offline copy from" : "Fetched"} ${formatRelative(fetchedAt)}`
            : results.isFetching
              ? "Searching"
              : undefined
        }
        actions={<SavedSearches current={applied} onLoad={apply} />}
      />
      <ViewToolbar
        search={{ value: query, onChange: setQuery, placeholder: "Filter loaded results" }}
        sort={{
          options: HACKTIVITY_SORT_FIELDS,
          value: sort,
          onChange: (next) => {
            const joined = joinSort(next.id, next.desc);
            if (joined) apply({ ...applied, sort: joined });
          },
        }}
        filters={{
          activeCount: activeHacktivityFilterCount(applied),
          onOpen: () => {
            setDraft(applied);
            setSheetOpen(true);
          },
        }}
        view={{ mode, onChange: setMode }}
      />
      <ActiveFilters
        filters={filterChips(applied, apply)}
        onClearAll={() => {
          apply({ ...DEFAULT_BUILDER_STATE, sort: applied.sort, filters: EMPTY_FILTERS });
        }}
      />
      {results.isError ? <ErrorNotice error={toAppError(results.error)} className="mx-5 mt-3" /> : null}
      {mode === "cards" ? (
        <CardGrid
          label="Hacktivity results"
          items={items}
          getKey={(item) => item.id}
          cardHeight={HACKTIVITY_CARD_HEIGHT}
          minCardWidth={320}
          empty={empty}
          onEndReached={loadMore}
          renderCard={(item) => <HacktivityCard item={item} onSelect={select} />}
        />
      ) : (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
          role="feed"
          aria-busy={results.isFetching}
          aria-label="Hacktivity results"
        >
          {items.length === 0 && !hasNextPage ? (
            <div className="py-10 text-center text-muted">{empty}</div>
          ) : null}
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((row) => {
              const item = items[row.index];
              return (
                <div
                  key={row.key}
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${String(row.start)}px)` }}
                >
                  {item ? (
                    <HacktivityRow item={item} onSelect={select} />
                  ) : (
                    <div className="flex h-[76px] items-center px-5 text-muted">Loading more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected ? (
        <HacktivityDetailSheet item={selected} open={detailOpen} onOpenChange={setDetailOpen} />
      ) : null}

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        activeCount={activeHacktivityFilterCount(draft)}
        onReset={() => {
          setDraft({ ...DEFAULT_BUILDER_STATE, sort: draft.sort });
        }}
        onApply={() => {
          setApplied(draft);
        }}
        applyDisabled={blocked}
        summary={
          <div className="flex flex-col gap-1">
            <span className="text-[12px] text-faint">Query sent to HackerOne</span>
            <p className="selectable font-mono text-[12px] break-all text-muted" aria-label="Compiled query">
              {queryStringFor(draft) || "All hacktivity"}
            </p>
          </div>
        }
      >
        <QueryBuilder state={draft} onChange={setDraft} />
      </FilterSheet>
    </>
  );
}
