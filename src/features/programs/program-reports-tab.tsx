import { Link } from "@tanstack/react-router";
import type { Report } from "@/ipc/reports";
import { EmptyState, ReportStateLabel, SeverityLabel } from "@/components/status";
import { formatDate, formatMoney, formatRelative } from "@/domain/format";
import { reportFiledAt } from "@/domain/program-insights";
import { bountyTotal } from "@/domain/reports";

const ROW_GRID = "grid grid-cols-[150px_minmax(0,1fr)_96px_96px_110px] items-center gap-4 px-5";

function ReportRow({ report }: { report: Report }) {
  const bounty = bountyTotal(report.bounties);
  const filedAt = reportFiledAt(report);
  return (
    <li>
      <Link
        to="/reports/$id"
        params={{ id: report.id }}
        className={`${ROW_GRID} h-10 border-b border-line transition-colors hover:bg-hover`}
      >
        <span className="truncate text-[13px]">
          <ReportStateLabel state={report.state} />
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-ink">{report.title}</span>
          <span className="shrink-0 font-mono text-[12px] text-faint">#{report.id}</span>
        </span>
        <span className="text-[13px]">
          <SeverityLabel rating={report.severity?.rating} />
        </span>
        <span className="text-right font-mono tabular-nums">
          {bounty > 0 ? (
            <span className="text-success">{formatMoney(bounty)}</span>
          ) : (
            <span className="text-faint">–</span>
          )}
        </span>
        <span className="text-right text-[13px] text-faint" title={formatDate(filedAt)}>
          {filedAt ? formatRelative(filedAt) : "–"}
        </span>
      </Link>
    </li>
  );
}

/**
 * The hacker's own cached reports against one program, newest first, each linking to its report
 * page.
 *
 * @param reports Reports already narrowed to the program.
 * @param loading Whether the local reports cache is still being read.
 */
export function ProgramReportsTab({ reports, loading }: { reports: readonly Report[]; loading: boolean }) {
  if (reports.length === 0) {
    return loading ? (
      <EmptyState title="Loading reports" />
    ) : (
      <EmptyState title="No reports to this program yet">
        Reports you file here appear once your reports have synced.
      </EmptyState>
    );
  }
  return (
    <ul aria-label="My reports to this program">
      {reports.map((report) => (
        <ReportRow key={report.id} report={report} />
      ))}
    </ul>
  );
}
