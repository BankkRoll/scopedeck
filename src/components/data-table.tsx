import { useTable, type RowData, type SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tableFeatureSet, type Columns } from "@/lib/table";

const ROW_HEIGHT = 36;

interface DataTableProps<T extends RowData> {
  data: T[];
  columns: Columns<T>;
  getRowId: (row: T, index: number) => string;
  onActivate?: (row: T) => void;
  initialSorting?: SortingState;
  empty?: ReactNode;
  label: string;
}

export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  onActivate,
  initialSorting = [],
  empty,
  label,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [cursor, setCursor] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const table = useTable({
    features: tableFeatureSet,
    columns,
    data,
    getRowId: (row, index) => getRowId(row, index),
    state: { sorting },
    onSortingChange: setSorting,
  });
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  const move = (next: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, next));
    setCursor(clamped);
    virtualizer.scrollToIndex(clamped, { align: "auto" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;
    const keys: Record<string, () => void> = {
      ArrowDown: () => {
        move(cursor + 1);
      },
      j: () => {
        move(cursor + 1);
      },
      ArrowUp: () => {
        move(cursor - 1);
      },
      k: () => {
        move(cursor - 1);
      },
      Home: () => {
        move(0);
      },
      End: () => {
        move(rows.length - 1);
      },
      Enter: () => {
        const row = rows[cursor];
        if (row && onActivate) onActivate(row.original);
      },
    };
    const handler = keys[event.key];
    if (handler && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      handler();
    }
  };

  const items = virtualizer.getVirtualItems();
  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-auto focus-visible:outline-offset-[-2px]"
    >
      <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
        <thead className="sticky top-0 z-10 bg-ground">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    style={{ width: header.column.getSize() }}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className="h-8 border-b border-line px-3 text-left font-medium text-faint"
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 hover:text-ink"
                      >
                        <table.FlexRender header={header} />
                        {sorted === "asc" ? <ArrowUp className="size-3" /> : null}
                        {sorted === "desc" ? <ArrowDown className="size-3" /> : null}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-3 py-10 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : null}
          {paddingTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={columnCount} style={{ height: paddingTop }} />
            </tr>
          ) : null}
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const active = item.index === cursor;
            return (
              <tr
                key={row.id}
                data-active={active || undefined}
                onClick={() => {
                  setCursor(item.index);
                  onActivate?.(row.original);
                }}
                className={cn(
                  "h-9 cursor-default transition-colors hover:bg-hover",
                  active && "bg-raised [&>td:first-child]:shadow-[inset_2px_0_0_var(--accent)]",
                )}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="truncate border-b border-line px-3">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden>
              <td colSpan={columnCount} style={{ height: paddingBottom }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
