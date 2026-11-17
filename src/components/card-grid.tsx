import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Props for {@link CardGrid}. */
export interface CardGridProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  /** Fixed card height in pixels; rows are virtualized, so cards cannot grow. */
  cardHeight: number;
  /** Cards never get narrower than this; the column count follows the available width. */
  minCardWidth?: number;
  label: string;
  empty?: ReactNode;
  /** Called when the grid nears its end, for infinite loading. */
  onEndReached?: () => void;
}

const GAP = 12;
const PADDING = 20;

/**
 * A responsive, virtualized card grid. Only the rows in view are rendered, so a page with
 * hundreds of programs scrolls as smoothly as the list view.
 *
 * Algorithm: measure the container, derive `columns = floor((width + gap) / (min + gap))`,
 * chunk items into rows of that size, and virtualize the rows.
 */
export function CardGrid<T>({
  items,
  getKey,
  renderCard,
  cardHeight,
  minCardWidth = 300,
  label,
  empty,
  onEndReached,
}: CardGridProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const inner = Math.max(0, width - PADDING * 2);
  const columns = Math.max(1, Math.floor((inner + GAP) / (minCardWidth + GAP)));
  const rowCount = Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => cardHeight + GAP,
    overscan: 4,
  });
  const rows = virtualizer.getVirtualItems();
  const lastRow = rows.at(-1)?.index ?? 0;

  useEffect(() => {
    if (onEndReached && rowCount > 0 && lastRow >= rowCount - 2) onEndReached();
  }, [lastRow, rowCount, onEndReached]);

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={label}
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ padding: PADDING }}
    >
      {items.length === 0 ? (
        <div className="py-10 text-center text-muted">{empty}</div>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {rows.map((row) => (
            <div
              key={row.key}
              role="list"
              className="absolute inset-x-0 grid"
              style={{
                top: row.start,
                height: cardHeight,
                gap: GAP,
                gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
              }}
            >
              {items.slice(row.index * columns, row.index * columns + columns).map((item) => (
                <div key={getKey(item)} role="listitem" className="min-w-0">
                  {renderCard(item)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The shared card surface: hairline border, quiet hover, visible focus. */
export const cardClass =
  "flex h-full w-full flex-col gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
