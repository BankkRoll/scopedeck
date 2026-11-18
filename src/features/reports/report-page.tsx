import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowUpRight, Paperclip } from "lucide-react";
import { useState, type ReactNode } from "react";
import { authStatus } from "@/ipc/auth";
import { toAppError } from "@/ipc/errors";
import type { Attachment } from "@/ipc/common";
import type { Activity, Report } from "@/ipc/reports";
import { ExternalLink } from "@/components/external-link";
import { openOnHackerOne } from "@/lib/open-external";
import { Markdown } from "@/components/markdown";
import { ProgramAvatar } from "@/components/program-avatar";
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  ReportStateLabel,
  SeverityLabel,
  SyncStatus,
} from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hackerOne } from "@/domain/deep-links";
import {
  assetTypeLabel,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatRelative,
  humanize,
} from "@/domain/format";
import { compileQuery, EMPTY_FILTERS } from "@/domain/hacktivity-query";
import { activityLabel, bountyTotal } from "@/domain/reports";
import { severityVector } from "@/domain/severity-vector";
import { useHacktivity } from "@/features/hacktivity/use-hacktivity";
import { ProgramLabel } from "@/features/programs/program-label";
import { needsAttention } from "@/domain/report-filters";
import { cn } from "@/lib/cn";
import { useProgramLookup } from "@/features/programs/use-programs";
import { useViewAction } from "@/features/shell/view-actions";
import { queryKeys } from "@/query/keys";
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-28 flex-col gap-0.5 px-4 py-2">
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className="truncate text-[14px] text-ink">{children}</dd>
    </div>
  );
}

/** The band under the header: whose report this is, where it stands, and how fast it moved. */
function ReportSummary({ report }: { report: Report }) {
  const lookup = useProgramLookup();
  const handle = report.program?.handle;
  const program = handle ? lookup.get(handle) : undefined;
  const name = program?.name ?? handle ?? "Unknown program";
  const total = bountyTotal(report.bounties);
  const submitted = report.submittedAt ?? report.createdAt;
  return (
    <div className="flex shrink-0 items-center gap-5 border-b border-line px-5 py-4">
      <ProgramAvatar name={name} src={program?.profilePicture} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          {handle ? (
            <Link
              to="/programs/$handle"
              params={{ handle }}
              className="truncate text-[14px] font-medium text-ink hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="text-[14px] font-medium text-ink">{name}</span>
          )}
          {handle ? <span className="font-mono text-[12px] text-faint">{handle}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
          <Badge>
            <ReportStateLabel state={report.state} />
          </Badge>
          <Badge>
            <SeverityLabel rating={report.severity?.rating} />
            {report.severity?.score != null ? (
              <span className="font-mono text-faint">{report.severity.score.toFixed(1)}</span>
            ) : null}
          </Badge>
          {report.weakness ? <Badge>{report.weakness.name}</Badge> : null}
          {report.structuredScope ? (
            <Badge className="font-mono">{report.structuredScope.assetIdentifier}</Badge>
          ) : null}
          {report.cveIds.map((cve) => (
            <Badge key={cve} className="font-mono">
              {cve}
            </Badge>
          ))}
          {needsAttention(report) ? (
            <Badge className="border-warning/50 text-warning">Waiting on you</Badge>
          ) : null}
          {report.disclosedAt ? <Badge>Disclosed</Badge> : null}
        </div>
      </div>
      <dl className="grid shrink-0 grid-cols-4 divide-x divide-line rounded-md border border-line">
        <Fact label="Bounty">
          <span className={cn("font-mono tabular-nums", total > 0 && "text-success")}>
            {total > 0 ? formatMoney(total) : "–"}
          </span>
        </Fact>
        <Fact label="Submitted">
          <span title={formatDateTime(submitted)}>{formatRelative(submitted)}</span>
        </Fact>
        <Fact label="First response">{formatDuration(submitted, report.firstProgramActivityAt) || "–"}</Fact>
        <Fact label="Time to triage">{formatDuration(submitted, report.triagedAt) || "–"}</Fact>
      </dl>
    </div>
  );
}

function Metadata({ report }: { report: Report }) {
  const submitted = report.submittedAt ?? report.createdAt;
  const rows: [string, ReactNode][] = [
    ["State", <ReportStateLabel key="state" state={report.state} />],
    [
      "Program",
      report.program ? (
        <ExternalLink href={hackerOne.program(report.program.handle)}>Open on HackerOne</ExternalLink>
      ) : (
        ""
      ),
    ],
    ["Severity", <SeverityLabel key="severity" rating={report.severity?.rating} />],
    ["CVSS score", report.severity?.score?.toFixed(1) ?? ""],
    [
      "CVSS vector",
      severityVector(report.severity) ? (
        <span
          key="vector"
          className="font-mono text-[12px]"
          title={severityVector(report.severity) ?? undefined}
        >
          {severityVector(report.severity)?.replace("CVSS:3.1/", "")}
        </span>
      ) : (
        ""
      ),
    ],
    ["Rated by", report.severity?.authorType ? humanize(report.severity.authorType) : ""],
    ["Weakness", report.weakness?.name ?? ""],
    ["CWE", report.weakness?.externalId?.toUpperCase() ?? ""],
    ["Asset", report.structuredScope?.assetIdentifier ?? ""],
    ["Asset type", report.structuredScope ? assetTypeLabel(report.structuredScope.assetType) : ""],
    ["Bounty", bountyTotal(report.bounties) > 0 ? formatMoney(bountyTotal(report.bounties)) : ""],
    ["CVE", report.cveIds.join(", ")],
    ["Submitted", formatDateTime(submitted)],
    ["First response", formatDateTime(report.firstProgramActivityAt)],
    ["Triaged", formatDateTime(report.triagedAt)],
    ["Bounty awarded", formatDateTime(report.bountyAwardedAt)],
    ["Closed", formatDateTime(report.closedAt)],
    ["Disclosed", formatDateTime(report.disclosedAt)],
    ["Your last activity", formatRelative(report.lastReporterActivityAt ?? null)],
    ["Program's last activity", formatRelative(report.lastProgramActivityAt ?? null)],
    ["Time to close", formatDuration(submitted, report.closedAt)],
  ];
  return (
    <dl className="flex flex-col">
      {rows
        .filter(([, value]) => value !== "" && value !== "never")
        .map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-line py-2 text-[13px]">
            <dt className="shrink-0 text-faint">{label}</dt>
            <dd className="selectable min-w-0 truncate text-right text-ink">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

/**
 * The amount paid. `awarded*` is what reached the hacker, in their payout currency; the plain
 * amounts are the program's USD figures and only fill in when nothing was awarded yet.
 */
function BountyAmount({ bounty }: { bounty: Report["bounties"][number] }) {
  const awarded = bounty.awardedAmount !== null;
  const amount = Number((awarded ? bounty.awardedAmount : bounty.amount) ?? 0);
  const bonus = Number((awarded ? bounty.awardedBonusAmount : bounty.bonusAmount) ?? 0);
  const currency = (awarded ? bounty.awardedCurrency : null) ?? "USD";
  return (
    <span className="font-mono tabular-nums">
      {formatMoney(amount, currency)}
      {bonus > 0 ? <span className="text-faint"> + {formatMoney(bonus, currency)} bonus</span> : null}
    </span>
  );
}

/**
 * Disclosed reports with the same weakness, fetched only when asked for so opening a report never
 * costs a Hacktivity request.
 */
function SimilarReports({ report }: { report: Report }) {
  const [open, setOpen] = useState(false);
  const cwe = report.weakness?.externalId ?? "";
  const query = cwe ? compileQuery({ ...EMPTY_FILTERS, cwe }) : "";
  const results = useHacktivity(query, "-total_awarded_amount", open && query !== "");
  if (!cwe) return null;
  const items = (results.data?.pages[0]?.page.items ?? [])
    .filter((item) => item.id !== report.id)
    .slice(0, 8);
  return (
    <section className="mt-6" aria-label="Similar disclosed reports">
      <h2 className="mb-2 text-[13px] font-medium text-faint">
        Similar disclosed reports <span className="font-mono">{cwe.toUpperCase()}</span>
      </h2>
      {!open ? (
        <Button
          size="sm"
          onClick={() => {
            setOpen(true);
          }}
        >
          Show top-paid disclosures
        </Button>
      ) : results.isPending ? (
        <p className="text-[13px] text-faint">Searching Hacktivity</p>
      ) : results.isError ? (
        <ErrorNotice error={toAppError(results.error)} />
      ) : items.length === 0 ? (
        <p className="text-[13px] text-faint">No disclosed reports for this weakness.</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id} className="border-b border-line py-2 text-[13px]">
              {item.url ? (
                <ExternalLink href={item.url}>{item.title ?? `Report #${item.id}`}</ExternalLink>
              ) : (
                <span className="text-ink">{item.title ?? `Report #${item.id}`}</span>
              )}
              <div className="mt-1 flex items-center justify-between gap-2 text-[12px] text-faint">
                <ProgramLabel handle={item.programHandle} name={item.programName} />
                <span className="shrink-0 font-mono">
                  {item.totalAwardedAmount ? formatMoney(item.totalAwardedAmount) : "No bounty"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function actorName(activity: Activity): string {
  return activity.actor?.username ?? activity.actor?.handle ?? activity.actor?.name ?? "HackerOne";
}

/** Program actors show the program's logo; people show their initial. */
function ActorAvatar({ activity }: { activity: Activity }) {
  const lookup = useProgramLookup();
  const handle = activity.actor?.kind === "program" ? activity.actor.handle : null;
  const program = handle ? lookup.get(handle) : undefined;
  return (
    <ProgramAvatar
      name={program?.name ?? actorName(activity)}
      src={program?.profilePicture}
      size="md"
      className="rounded-full"
    />
  );
}

function Timeline({ report, username }: { report: Report; username: string | null }) {
  return (
    <ol className="relative flex flex-col gap-5">
      <span className="absolute top-3 bottom-3 left-3 w-px bg-line" aria-hidden />
      {report.activities.map((activity) => {
        const mine = username !== null && activity.actor?.username === username;
        return (
          <li key={activity.id} className="relative flex gap-3">
            <ActorAvatar activity={activity} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="font-medium text-ink">{mine ? "You" : actorName(activity)}</span>
                {activity.actor?.kind === "program" ? (
                  <span className="text-[11px] text-faint uppercase">Program</span>
                ) : null}
                {activity.internal ? (
                  <span className="text-[11px] text-warning uppercase">Internal</span>
                ) : null}
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
                <div
                  className={cn(
                    "mt-1.5 max-w-3xl rounded-md border px-3 py-2",
                    mine ? "border-accent/30 bg-accent/5" : "border-line bg-surface",
                  )}
                >
                  <Markdown source={activity.message} />
                </div>
              ) : null}
              <AttachmentList attachments={activity.attachments} />
            </div>
          </li>
        );
      })}
      {report.activities.length === 0 ? <li className="pl-9 text-muted">No activity yet.</li> : null}
    </ol>
  );
}

export function ReportPage() {
  const { id } = useParams({ from: "/reports/$id" });
  const { report, syncing, syncError, syncedAt, refresh } = useReport(id);
  const auth = useQuery({ queryKey: queryKeys.auth, queryFn: authStatus, staleTime: Infinity });
  useViewAction("refresh", refresh);

  return (
    <>
      <PageHeader
        parent={{ to: "/reports", label: "Reports" }}
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
        <>
          <ReportSummary report={report} />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              {report.summaries.length > 0 ? (
                <section className="mb-6">
                  <h2 className="mb-2 text-[13px] font-medium text-faint">Summaries</h2>
                  {report.summaries.map((summary) => (
                    <div key={summary.id} className="mb-3 rounded-md border border-line bg-surface px-3 py-2">
                      <p className="text-[12px] text-faint">
                        {humanize(summary.category)} summary
                        {summary.createdAt ? ` · ${formatRelative(summary.createdAt)}` : ""}
                      </p>
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
                <h2 className="mb-3 text-[13px] font-medium text-faint">
                  Activity <span className="font-mono">{report.activities.length}</span>
                </h2>
                <Timeline report={report} username={auth.data?.username ?? null} />
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
                    <div
                      key={bounty.id}
                      className="flex justify-between border-b border-line py-2 text-[13px]"
                    >
                      <span className="text-muted">{formatDateTime(bounty.createdAt)}</span>
                      <BountyAmount bounty={bounty} />
                    </div>
                  ))}
                </section>
              ) : null}
              <SimilarReports report={report} />
            </aside>
          </div>
        </>
      )}
    </>
  );
}
