import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { toAppError } from "@/ipc/errors";
import type { HacktivityItem } from "@/ipc/hacktivity";
import { EmptyState, ErrorNotice, SeverityLabel } from "@/components/status";
import { Button } from "@/components/ui/button";
import { hackerOne } from "@/domain/deep-links";
import { formatDate, formatMoney, formatRelative } from "@/domain/format";
import { programHacktivityQuery } from "@/domain/program-insights";
import { openOnHackerOne } from "@/lib/open-external";
import { useHacktivity } from "@/features/hacktivity/use-hacktivity";

function HacktivityRow({ item }: { item: HacktivityItem }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => void openOnHackerOne(item.url ?? hackerOne.report(item.id))}
        className="group grid h-10 w-full grid-cols-[96px_minmax(0,1fr)_96px_120px_16px] items-center gap-4 border-b border-line px-5 text-left transition-colors hover:bg-hover"
      >
        <span className="text-[13px]">
          <SeverityLabel rating={item.severityRating} />
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-ink">{item.title ?? "Untitled report"}</span>
          {item.reporterUsername ? (
            <span className="shrink-0 text-[12px] text-faint">by {item.reporterUsername}</span>
          ) : null}
        </span>
        <span className="text-right font-mono tabular-nums">
          {item.totalAwardedAmount ? (
            <span className="text-success">{formatMoney(item.totalAwardedAmount)}</span>
          ) : (
            <span className="text-faint">–</span>
          )}
        </span>
        <span className="text-right text-[13px] text-faint">
          {item.disclosedAt ? formatDate(item.disclosedAt) : formatRelative(item.latestDisclosableActivityAt)}
        </span>
        <ArrowUpRight className="size-3.5 text-faint opacity-0 group-hover:opacity-100" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Disclosed Hacktivity for one program, newest disclosure first. Mount it only while its tab is
 * open: it starts fetching as soon as it renders.
 */
export function ProgramHacktivityTab({ handle }: { handle: string }) {
  const results = useHacktivity(programHacktivityQuery(handle), "-disclosed_at", true);
  const items = useMemo(() => results.data?.pages.flatMap((page) => page.page.items) ?? [], [results.data]);
  const fromCache = results.data?.pages.some((page) => page.fromCache) ?? false;

  if (results.error && items.length === 0) {
    return <ErrorNotice error={toAppError(results.error)} className="mx-5 mt-3" />;
  }
  if (items.length === 0) {
    return results.isPending ? (
      <EmptyState title="Loading Hacktivity" />
    ) : (
      <EmptyState title="No disclosed reports">
        This program has not publicly disclosed any reports.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col">
      {fromCache ? (
        <p className="border-b border-line px-5 py-2 text-[13px] text-faint">
          Offline copy from {formatRelative(results.data?.pages[0]?.fetchedAt)}
        </p>
      ) : null}
      <ul aria-label="Disclosed reports">
        {items.map((item) => (
          <HacktivityRow key={item.id} item={item} />
        ))}
      </ul>
      {results.hasNextPage ? (
        <div className="flex justify-center py-4">
          <Button
            size="sm"
            variant="secondary"
            disabled={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            {results.isFetchingNextPage ? "Loading" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
