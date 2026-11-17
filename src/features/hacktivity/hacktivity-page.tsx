import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toAppError } from "@/ipc/errors";
import type { HacktivityItem } from "@/ipc/hacktivity";
import { savedSearchDelete, savedSearchSave, savedSearchesList } from "@/ipc/workspace";
import { openOnHackerOne } from "@/lib/open-external";
import { EmptyState, ErrorNotice, PageHeader, SeverityLabel } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { hackerOne } from "@/domain/deep-links";
import { formatDate, formatMoney, formatRelative, humanize } from "@/domain/format";
import {
  DEFAULT_BUILDER_STATE,
  builderStateSchema,
  filterProblems,
  queryStringFor,
  type BuilderState,
} from "@/domain/hacktivity-query";
import { useViewAction } from "@/features/shell/view-actions";
import { queryKeys } from "@/query/keys";
import { QueryBuilder } from "./query-builder";
import { useHacktivity } from "./use-hacktivity";

const ROW_HEIGHT = 76;

function HacktivityRow({ item }: { item: HacktivityItem }) {
  const url = item.url ?? hackerOne.report(item.id);
  return (
    <button
      type="button"
      onClick={() => void openOnHackerOne(url)}
      className="flex h-[76px] w-full flex-col justify-center gap-1 border-b border-line px-5 text-left transition-colors hover:bg-hover"
    >
      <div className="flex w-full items-center gap-3">
        <span className="w-24 shrink-0">
          <SeverityLabel rating={item.severityRating} />
        </span>
        <span className="min-w-0 flex-1 truncate text-ink">{item.title ?? "Untitled report"}</span>
        {item.totalAwardedAmount ? (
          <span className="shrink-0 font-mono tabular-nums">{formatMoney(item.totalAwardedAmount)}</span>
        ) : null}
      </div>
      <div className="flex w-full items-center gap-3 text-[13px] text-faint">
        <span className="w-24 shrink-0 font-mono">#{item.id}</span>
        <span className="truncate">
          {[
            item.programName ?? item.programHandle,
            item.reporterUsername ? `by ${item.reporterUsername}` : null,
            item.cwe,
            item.cveIds.join(", ") || null,
            item.substate ? humanize(item.substate.toLowerCase()) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="ml-auto shrink-0">
          {item.disclosedAt
            ? `Disclosed ${formatDate(item.disclosedAt)}`
            : formatRelative(item.latestDisclosableActivityAt)}
          {item.votes ? ` · ${item.votes} votes` : ""}
        </span>
      </div>
    </button>
  );
}

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
  const [selected, setSelected] = useState("");
  const selectedSearch = valid.find((search) => search.id === selected);

  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Saved searches"
        className="w-52"
        value={selected}
        onChange={(event) => {
          setSelected(event.target.value);
          const match = valid.find((search) => search.id === event.target.value);
          if (match) onLoad(match.state);
        }}
      >
        <option value="">Saved searches ({valid.length})</option>
        {valid.map((search) => (
          <option key={search.id} value={search.id}>
            {search.name}
          </option>
        ))}
      </Select>
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
        <Button type="submit" size="md" disabled={!name.trim() || save.isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}

export function HacktivityPage() {
  const [draft, setDraft] = useState<BuilderState>(DEFAULT_BUILDER_STATE);
  const [applied, setApplied] = useState<BuilderState>(DEFAULT_BUILDER_STATE);
  const [expanded, setExpanded] = useState(true);
  const queryString = queryStringFor(applied);
  const results = useHacktivity(queryString, applied.sort, true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = results.data?.pages.flatMap((page) => page.page.items) ?? [];
  const fromCache = results.data?.pages.some((page) => page.fromCache) ?? false;
  const fetchedAt = results.data?.pages[0]?.fetchedAt;
  const blocked = draft.mode === "builder" && filterProblems(draft.filters).length > 0;

  const virtualizer = useVirtualizer({
    count: items.length + (results.hasNextPage ? 1 : 0),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems.at(-1)?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = results;

  useEffect(() => {
    if (lastIndex >= items.length - 1 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [lastIndex, items.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { refetch } = results;
  useViewAction(
    "refresh",
    useCallback(() => {
      void refetch();
    }, [refetch]),
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
        actions={
          <>
            <SavedSearches
              current={draft}
              onLoad={(state) => {
                setDraft(state);
                setApplied(state);
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={expanded ? "Hide filters" : "Show filters"}
              onClick={() => {
                setExpanded(!expanded);
              }}
            >
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </>
        }
      />
      {expanded ? (
        <form
          className="shrink-0 border-b border-line px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!blocked) setApplied(draft);
          }}
        >
          <QueryBuilder state={draft} onChange={setDraft} />
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="primary" disabled={blocked}>
              Search
            </Button>
            <Button
              onClick={() => {
                setDraft(DEFAULT_BUILDER_STATE);
                setApplied(DEFAULT_BUILDER_STATE);
              }}
            >
              Reset
            </Button>
          </div>
        </form>
      ) : null}
      {results.isError ? <ErrorNotice error={toAppError(results.error)} className="mx-5 mt-3" /> : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        role="feed"
        aria-busy={results.isFetching}
        aria-label="Hacktivity results"
      >
        {items.length === 0 && !results.isFetching && !results.isError ? (
          <EmptyState title="No disclosed reports match">
            Loosen a filter or switch to a Lucene query.
          </EmptyState>
        ) : null}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualItems.map((row) => {
            const item = items[row.index];
            return (
              <div
                key={row.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                }}
              >
                {item ? (
                  <HacktivityRow item={item} />
                ) : (
                  <div className="flex h-[76px] items-center px-5 text-muted">Loading more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
