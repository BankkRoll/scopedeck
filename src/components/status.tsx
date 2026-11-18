import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { describeError, type AppError } from "@/ipc/errors";
import { formatDateTime, formatRelative, humanize } from "@/domain/format";
import { cn } from "@/lib/cn";
import { Button } from "./ui/button";

interface SyncStatusProps {
  syncedAt: string | null;
  syncing: boolean;
  onRefresh: () => void;
}

export function SyncStatus({ syncedAt, syncing, onRefresh }: SyncStatusProps) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-faint">
      <span title={syncedAt ? formatDateTime(syncedAt) : undefined}>
        {syncing ? "Syncing" : syncedAt ? `Synced ${formatRelative(syncedAt)}` : "Not synced yet"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRefresh}
        disabled={syncing}
        aria-label="Sync now"
        title="Sync now (R)"
      >
        <RefreshCw className={cn(syncing && "animate-spin")} />
      </Button>
    </div>
  );
}

export function ErrorNotice({
  error,
  action,
  className,
}: {
  error: AppError;
  action?: ReactNode;
  className?: string;
}) {
  const { title, detail } = describeError(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-md border border-line-strong bg-surface px-3 py-2.5",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {detail ? <p className="mt-0.5 text-muted">{detail}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-16 text-center">
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {children ? <div className="text-muted">{children}</div> : null}
    </div>
  );
}

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
  none: "bg-sev-none",
};

export function SeverityLabel({ rating }: { rating: string | null | undefined }) {
  if (!rating) return <span className="text-faint">Unrated</span>;
  const key = rating.toLowerCase();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-[2px]", SEVERITY_CLASS[key] ?? "bg-sev-none")} aria-hidden />
      {humanize(key)}
    </span>
  );
}

/** The list page a detail page belongs to, shown as a back arrow and the breadcrumb root. */
export interface PageParent {
  to: "/programs" | "/reports" | "/intents" | "/hacktivity" | "/earnings";
  label: string;
}

export function PageHeader({
  title,
  meta,
  actions,
  parent,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  parent?: PageParent;
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-line px-5">
      <div className="flex min-w-0 items-center gap-2">
        {parent ? (
          <>
            <Link
              to={parent.to}
              aria-label={`Back to ${parent.label}`}
              title={`Back to ${parent.label}`}
              className="-ml-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <nav aria-label="Breadcrumb" className="flex shrink-0 items-center gap-1 text-[13px]">
              <Link to={parent.to} className="text-faint transition-colors hover:text-ink">
                {parent.label}
              </Link>
              <ChevronRight className="size-3.5 text-faint" aria-hidden />
            </nav>
          </>
        ) : null}
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>
          {meta ? <div className="truncate text-faint">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

const STATE_TONE: Record<string, string> = {
  new: "bg-accent",
  "pending-program-review": "bg-accent",
  triaged: "bg-accent",
  retesting: "bg-accent",
  "needs-more-info": "bg-warning",
  resolved: "bg-success",
  informative: "bg-sev-none",
  duplicate: "bg-sev-none",
  "not-applicable": "bg-sev-none",
  spam: "bg-danger",
};

/** A report state with a colored dot: blue in progress, amber waiting on you, green resolved. */
export function ReportStateLabel({ state }: { state: string | null | undefined }) {
  if (!state) return <span className="text-faint">Unknown</span>;
  const tone = STATE_TONE[state] ?? "bg-sev-none";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", tone === "bg-sev-none" ? "text-muted" : "text-ink")}
    >
      <span className={cn("size-1.5 rounded-full", tone)} aria-hidden />
      {humanize(state)}
    </span>
  );
}
