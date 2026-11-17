import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useRef, type ReactNode } from "react";
import { useViewAction } from "@/features/shell/view-actions";
import type { SortState, ViewMode } from "@/lib/view-state";
import { cn } from "@/lib/cn";
import { Input } from "./ui/field";
import { Select, type SelectOption } from "./ui/select";

/** Props for {@link ViewToolbar}. Every section is optional so pages show only what applies. */
export interface ViewToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  sort?: {
    options: readonly SelectOption<string>[];
    value: SortState;
    onChange: (value: SortState) => void;
  };
  filters?: { activeCount: number; onOpen: () => void };
  view?: { mode: ViewMode; onChange: (mode: ViewMode) => void };
  /** Extra controls placed between search and the right-hand group. */
  children?: ReactNode;
}

const segment =
  "grid size-7 place-items-center rounded-[5px] text-faint transition-colors hover:text-ink aria-pressed:bg-raised aria-pressed:text-ink";

/**
 * The toolbar every data page shares: search on the left; sort, filters and the list/cards
 * toggle on the right, always in the same order so muscle memory carries between pages.
 */
export function ViewToolbar({ search, sort, filters, view, children }: ViewToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  useViewAction(
    "search",
    useCallback(() => searchRef.current?.focus(), []),
  );
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-5 py-2.5">
      {search ? (
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            type="search"
            aria-label={search.placeholder}
            placeholder={search.placeholder}
            value={search.value}
            onChange={(event) => {
              search.onChange(event.target.value);
            }}
            className="pl-8"
          />
        </div>
      ) : null}
      {children}
      <div className="ml-auto flex items-center gap-2">
        {sort ? (
          <div className="flex items-center">
            <Select
              aria-label="Sort by"
              value={sort.value.id}
              options={sort.options}
              onValueChange={(id) => {
                sort.onChange({ ...sort.value, id });
              }}
              className="w-44 rounded-r-none"
            />
            <button
              type="button"
              aria-label={sort.value.desc ? "Sorted descending" : "Sorted ascending"}
              title={sort.value.desc ? "Descending" : "Ascending"}
              onClick={() => {
                sort.onChange({ ...sort.value, desc: !sort.value.desc });
              }}
              className="grid size-8 place-items-center rounded-r-md border border-l-0 border-line bg-raised text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {sort.value.desc ? (
                <ArrowDownWideNarrow className="size-3.5" />
              ) : (
                <ArrowUpNarrowWide className="size-3.5" />
              )}
            </button>
          </div>
        ) : null}
        {filters ? (
          <button
            type="button"
            onClick={filters.onOpen}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
              filters.activeCount
                ? "border-accent/60 bg-accent/10 text-ink"
                : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {filters.activeCount ? (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] text-accent-ink">
                {filters.activeCount}
              </span>
            ) : null}
          </button>
        ) : null}
        {view ? (
          <div
            role="group"
            aria-label="Layout"
            className="flex rounded-md border border-line bg-surface p-0.5"
          >
            <button
              type="button"
              aria-label="Card view"
              aria-pressed={view.mode === "cards"}
              onClick={() => {
                view.onChange("cards");
              }}
              className={segment}
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view.mode === "list"}
              onClick={() => {
                view.onChange("list");
              }}
              className={segment}
            >
              <List className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
