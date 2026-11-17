import { useParams } from "@tanstack/react-router";
import { ArrowUpRight, Paperclip } from "lucide-react";
import type { Attachment } from "@/ipc/common";
import type { Report } from "@/ipc/reports";
import { ExternalLink } from "@/components/external-link";
import { openOnHackerOne } from "@/lib/open-external";
import { Markdown } from "@/components/markdown";
import { EmptyState, ErrorNotice, PageHeader, SeverityLabel, SyncStatus } from "@/components/status";
import { Button } from "@/components/ui/button";
import { hackerOne } from "@/domain/deep-links";
import { formatBytes, formatDateTime, formatMoney, formatRelative, humanize } from "@/domain/format";
import { activityLabel, bountyTotal } from "@/domain/reports";
import { ProgramLabel } from "@/features/programs/program-label";
import { useViewAction } from "@/features/shell/view-actions";
import { useReport } from "./use-reports";

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="flex items-center gap-2 text-[13px]">
          <Paperclip className="size-3.5 text-faint" aria-hidden />
          <span className="truncate">{attachment.fileName}</span>
          {attachment.fileSize !== null ? (
            <span className="font-mono text-faint">{formatBytes(attachment.fileSize)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Metadata({ report }: { report: Report }) {
  const rows: [string, React.ReactNode][] = [
    ["State", humanize(report.state)],
    [
      "Program",
      report.program ? (
        <span className="inline-flex items-center gap-2">
          <ProgramLabel handle={report.program.handle} />
          <ExternalLink href={hackerOne.program(report.program.handle)}>Open</ExternalLink>
        </span>
      ) : (
        "Unknown"
      ),
    ],
    ["Severity", <SeverityLabel key="severity" rating={report.severity?.rating} />],
    ["CVSS score", report.severity?.score?.toFixed(1) ?? ""],
    ["Weakness", report.weakness?.name ?? ""],
    ["Asset", report.structuredScope?.assetIdentifier ?? ""],
    ["Bounty", bountyTotal(report.bounties) > 0 ? formatMoney(bountyTotal(report.bounties)) : ""],
    ["CVE", report.cveIds.join(", ")],
    ["Submitted", formatDateTime(report.submittedAt ?? report.createdAt)],
    ["Triaged", formatDateTime(report.triagedAt)],
    ["Closed", formatDateTime(report.closedAt)],
    ["Disclosed", formatDateTime(report.disclosedAt)],
  ];
  return (
    <dl className="flex flex-col">
      {rows
        .filter(([, value]) => value !== "")
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-line py-2 text-[13px]">
            <dt className="text-faint">{label}</dt>
            <dd className="selectable truncate text-right text-ink">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function ReportPage() {
  const { id } = useParams({ from: "/reports/$id" });
  const { report, syncing, syncError, syncedAt, refresh } = useReport(id);
  useViewAction("refresh", refresh);

  return (
    <>
      <PageHeader
        title={report?.title ?? `Report #${id}`}
        meta={<span className="font-mono">#{id}</span>}
        actions={
          <>
            <SyncStatus syncedAt={syncedAt} syncing={syncing} onRefresh={refresh} />
            <Button onClick={() => void openOnHackerOne(hackerOne.report(id))}>
              Reply or attach on HackerOne
              <ArrowUpRight />
            </Button>
          </>
        }
      />
      {syncError ? <ErrorNotice error={syncError} className="mx-5 mt-3" /> : null}
      {!report ? (
        <EmptyState title={syncing ? "Loading the report" : "This report is not cached yet"} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {report.summaries.length > 0 ? (
              <section className="mb-6">
                <h2 className="mb-2 text-[13px] font-medium text-faint">Summaries</h2>
                {report.summaries.map((summary) => (
                  <div key={summary.id} className="mb-3 border-l-2 border-line-strong pl-3">
                    <p className="text-[13px] text-faint">{humanize(summary.category)}</p>
                    <p className="selectable mt-1 whitespace-pre-line">{summary.content}</p>
                  </div>
                ))}
              </section>
            ) : null}
            <section>
              <h2 className="mb-2 text-[13px] font-medium text-faint">Vulnerability information</h2>
              {report.vulnerabilityInformation ? (
                <Markdown source={report.vulnerabilityInformation} className="max-w-3xl" />
              ) : (
                <p className="text-muted">The API only returns the body of reports you own.</p>
              )}
              <AttachmentList attachments={report.attachments} />
            </section>
            <section className="mt-8" aria-label="Activity">
              <h2 className="mb-3 text-[13px] font-medium text-faint">Activity</h2>
              <ol className="relative flex flex-col gap-5 border-l border-line pl-5">
                {report.activities.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span
                      className="absolute top-1.5 -left-[23.5px] size-2 rounded-full border border-line-strong bg-ground"
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                      <span className="font-medium text-ink">
                        {activity.actor?.username ??
                          activity.actor?.handle ??
                          activity.actor?.name ??
                          "HackerOne"}
                      </span>
                      <span className="text-muted">{activityLabel(activity.kind)}</span>
                      <time
                        className="text-faint"
                        dateTime={activity.createdAt ?? undefined}
                        title={formatDateTime(activity.createdAt)}
                      >
                        {formatRelative(activity.createdAt)}
                      </time>
                    </div>
                    {activity.message ? (
                      <Markdown source={activity.message} className="mt-1.5 max-w-3xl" />
                    ) : null}
                    <AttachmentList attachments={activity.attachments} />
                  </li>
                ))}
                {report.activities.length === 0 ? <li className="text-muted">No activity yet.</li> : null}
              </ol>
              <Button className="mt-5" onClick={() => void openOnHackerOne(hackerOne.report(id))}>
                Reply on HackerOne
                <ArrowUpRight />
              </Button>
            </section>
          </div>
          <aside
            className="min-h-0 overflow-y-auto border-l border-line px-5 py-3"
            aria-label="Report details"
          >
            <Metadata report={report} />
            {report.bounties.length > 0 ? (
              <section className="mt-5">
                <h2 className="mb-1 text-[13px] font-medium text-faint">Bounties</h2>
                {report.bounties.map((bounty) => (
                  <div key={bounty.id} className="flex justify-between border-b border-line py-2 text-[13px]">
                    <span className="text-muted">{formatDateTime(bounty.createdAt)}</span>
                    <span className="font-mono">
                      {bounty.amount ?? "0"}
                      {bounty.bonusAmount && Number(bounty.bonusAmount) > 0
                        ? ` + ${bounty.bonusAmount}`
                        : ""}{" "}
                      USD
                    </span>
                  </div>
                ))}
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </>
  );
}
