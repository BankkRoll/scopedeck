import { Link, useParams } from "@tanstack/react-router";
import { ArrowUpRight, Star } from "lucide-react";
import { useMemo } from "react";
import { openOnHackerOne } from "@/lib/open-external";
import { Markdown } from "@/components/markdown";
import { EmptyState, ErrorNotice, PageHeader, SyncStatus } from "@/components/status";
import { ProgramAvatar } from "@/components/program-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hackerOne } from "@/domain/deep-links";
import { formatDate, formatMoney, formatRelative, humanize } from "@/domain/format";
import { formatPercent, reportsForProgram, validReportRate } from "@/domain/program-insights";
import { cn } from "@/lib/cn";
import { useViewAction } from "@/features/shell/view-actions";
import { useReports } from "@/features/reports/use-reports";
import { NotesPanel } from "./notes-panel";
import { ProgramHacktivityTab } from "./program-hacktivity-tab";
import { ProgramReportsTab } from "./program-reports-tab";
import { ScopePanel } from "./scope-panel";
import { usePinProgram, useProgram } from "./use-programs";

export function ProgramPage() {
  const { handle } = useParams({ from: "/programs/$handle" });
  const detail = useProgram(handle);
  const pin = usePinProgram();
  useViewAction("refresh", detail.refresh);

  const reports = useReports();
  const myReports = useMemo(() => reportsForProgram(reports.data ?? [], handle), [reports.data, handle]);

  const program = detail.data?.program;
  const name = program?.name ?? handle;
  const validRate = validReportRate(
    program?.numberOfReportsForUser ?? null,
    program?.numberOfValidReportsForUser ?? null,
  );
  const stats: [label: string, value: string][] = program
    ? [
        ["My reports", String(program.numberOfReportsForUser ?? 0)],
        ["Valid", String(program.numberOfValidReportsForUser ?? 0)],
        ...(validRate === null ? [] : [["Valid %", formatPercent(validRate)] as [string, string]]),
        [
          "Earned",
          program.bountyEarnedForUser
            ? formatMoney(program.bountyEarnedForUser, program.currency ?? "USD")
            : "$0",
        ],
      ]
    : [];

  return (
    <>
      <PageHeader
        parent={{ to: "/programs", label: "Programs" }}
        title={name}
        meta={<span className="font-mono">{handle}</span>}
        actions={
          <>
            <SyncStatus syncedAt={detail.syncedAt} syncing={detail.syncing} onRefresh={detail.refresh} />
            {program ? (
              <Button
                size="icon"
                variant="ghost"
                aria-pressed={program.pinned}
                aria-label={program.pinned ? "Unpin program" : "Pin program"}
                onClick={() => {
                  pin.mutate({ handle, pinned: !program.pinned });
                }}
              >
                <Star className={cn(program.pinned && "fill-warning text-warning")} />
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void openOnHackerOne(hackerOne.programScope(handle))}>
              Open on HackerOne
              <ArrowUpRight />
            </Button>
            <Link
              to="/compose"
              search={{ program: handle }}
              className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-[13px] font-medium text-accent-ink hover:bg-accent-hover active:translate-y-px"
            >
              Write report
            </Link>
          </>
        }
      />
      {detail.syncError ? <ErrorNotice error={detail.syncError} className="mx-5 mt-3" /> : null}
      {program ? (
        <div className="flex shrink-0 items-center gap-6 border-b border-line px-5 py-4">
          <ProgramAvatar name={name} src={program.profilePicture} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {program.offersBounties ? (
                <Badge className="border-accent/40 text-link">Bounty program</Badge>
              ) : (
                <Badge>Vulnerability disclosure</Badge>
              )}
              <Badge>
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    program.submissionState === "open" ? "bg-success" : "bg-warning",
                  )}
                  aria-hidden
                />
                {program.submissionState === "open"
                  ? "Accepting reports"
                  : humanize(program.submissionState) || "Unknown"}
              </Badge>
              <Badge>{humanize(program.state?.replace(/_mode$/, "")) || "Unknown"}</Badge>
              {program.triageActive ? <Badge>Managed triage</Badge> : null}
              {program.fastPayments ? <Badge>Fast payments</Badge> : null}
              {program.goldStandardSafeHarbor ? <Badge>Gold standard safe harbor</Badge> : null}
              {program.openScope ? <Badge>Open scope</Badge> : null}
              {program.allowsBountySplitting ? <Badge>Bounty splitting</Badge> : null}
            </div>
            {program.startedAcceptingAt || program.lastInvitationAcceptedAtForUser ? (
              <p className="flex flex-wrap gap-x-3 text-[13px] text-faint">
                {program.startedAcceptingAt ? (
                  <span>Accepting reports since {formatDate(program.startedAcceptingAt)}</span>
                ) : null}
                {program.lastInvitationAcceptedAtForUser ? (
                  <span>Joined {formatDate(program.lastInvitationAcceptedAtForUser)}</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <dl className="flex shrink-0 divide-x divide-line rounded-md border border-line">
            {stats.map(([label, value]) => (
              <div key={label} className="flex min-w-24 flex-col gap-0.5 px-4 py-2">
                <dt className="text-[12px] text-faint">{label}</dt>
                <dd className="font-mono text-[15px] text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <Tabs defaultValue="policy" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="scope">
            Scope <span className="font-mono text-faint">{detail.data?.scopes.length ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="exclusions">
            Exclusions <span className="font-mono text-faint">{detail.data?.exclusions.length ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="weaknesses">
            Weaknesses <span className="font-mono text-faint">{detail.data?.weaknesses.length ?? 0}</span>
          </TabsTrigger>
          <TabsTrigger value="reports">
            My reports <span className="font-mono text-faint">{myReports.length}</span>
          </TabsTrigger>
          <TabsTrigger value="hacktivity">Hacktivity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>
        <TabsContent value="scope">
          {detail.data ? <ScopePanel scopes={detail.data.scopes} /> : <EmptyState title="Loading scope" />}
        </TabsContent>
        <TabsContent value="exclusions">
          {detail.data?.exclusions.length ? (
            <ul>
              {detail.data.exclusions.map((exclusion) => (
                <li key={exclusion.id} className="border-b border-line px-5 py-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-medium">{exclusion.category ?? "Uncategorised"}</p>
                    {exclusion.updatedAt || exclusion.createdAt ? (
                      <span
                        className="shrink-0 text-[12px] text-faint"
                        title={formatDate(exclusion.updatedAt ?? exclusion.createdAt)}
                      >
                        {exclusion.updatedAt ? "Updated" : "Added"}{" "}
                        {formatRelative(exclusion.updatedAt ?? exclusion.createdAt)}
                      </span>
                    ) : null}
                  </div>
                  {exclusion.details ? (
                    <p className="selectable mt-1 whitespace-pre-line text-muted">{exclusion.details}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No scope exclusions">
              This program excludes no extra report categories from rewards.
            </EmptyState>
          )}
        </TabsContent>
        <TabsContent value="weaknesses">
          <ul>
            {(detail.data?.weaknesses ?? []).map((weakness) => (
              <li key={weakness.id} className="flex items-baseline gap-3 border-b border-line px-5 py-2">
                <span className="w-20 shrink-0 font-mono text-faint">
                  {weakness.externalId?.toUpperCase() ?? ""}
                </span>
                <div className="min-w-0">
                  <p className="text-ink">{weakness.name}</p>
                  {weakness.description ? (
                    <p className="selectable mt-0.5 line-clamp-2 text-[13px] text-muted">
                      {weakness.description}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="policy" className="min-h-0 overflow-y-auto px-5 py-4">
          {program?.policy ? (
            <Markdown source={program.policy} className="max-w-3xl" />
          ) : (
            <EmptyState title="No policy text">The API returned no policy for this program.</EmptyState>
          )}
        </TabsContent>
        <TabsContent value="reports">
          <ProgramReportsTab reports={myReports} loading={reports.loadingCache} />
        </TabsContent>
        <TabsContent value="hacktivity">
          <ProgramHacktivityTab handle={handle} />
        </TabsContent>
        <TabsContent value="notes" className="flex min-h-0 flex-col overflow-hidden">
          <NotesPanel handle={handle} />
        </TabsContent>
      </Tabs>
    </>
  );
}
