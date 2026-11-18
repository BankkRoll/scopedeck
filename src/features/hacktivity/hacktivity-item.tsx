/**
 * Presentation of a single Hacktivity item: the list row, the card, and the detail sheet that
 * shows the published summary.
 *
 * Rows and cards use a stretched button (its `::after` covers the whole surface) instead of
 * wrapping everything in a `<button>`, so the program link inside stays a real, separately
 * focusable link rather than invalid nested interactive content.
 */
import { Link } from "@tanstack/react-router";
import { ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import type { HacktivityItem } from "@/ipc/hacktivity";
import { openOnHackerOne } from "@/lib/open-external";
import { cn } from "@/lib/cn";
import { cardClass } from "@/components/card-grid";
import { ExternalLink } from "@/components/external-link";
import { Markdown } from "@/components/markdown";
import { ProgramAvatar } from "@/components/program-avatar";
import { SeverityLabel } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { hackerOne } from "@/domain/deep-links";
import { formatDate, formatDateTime, formatMoney, formatRelative, humanize } from "@/domain/format";
import { disclosableActionLabel, timeToDisclose } from "@/domain/hacktivity-display";
import { useProgramLookup } from "@/features/programs/use-programs";

/** Fixed height of a list row; the list is virtualized against it. */
export const HACKTIVITY_ROW_HEIGHT = 76;

/** Fixed height of a card; the grid is virtualized against it. */
export const HACKTIVITY_CARD_HEIGHT = 224;

const stretchedButton =
  "min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-focus";

function itemUrl(item: HacktivityItem): string {
  return item.url ?? hackerOne.report(item.id);
}

function substateLabel(item: HacktivityItem): string {
  return item.substate ? humanize(item.substate.toLowerCase()) : "";
}

function latestActivity(item: HacktivityItem): { text: string; title: string } {
  const at = item.latestDisclosableActivityAt ?? item.disclosedAt;
  const label = disclosableActionLabel(item.latestDisclosableAction) || (item.disclosedAt ? "Disclosed" : "");
  if (!at) return { text: label, title: "" };
  return { text: [label, formatRelative(at)].filter(Boolean).join(" "), title: formatDateTime(at) };
}

function ProgramLink({ item, className }: { item: HacktivityItem; className?: string }) {
  const cached = useProgramLookup().get(item.programHandle ?? "");
  const name = cached?.name ?? item.programName ?? item.programHandle;
  if (!name) return null;
  const content = (
    <>
      <ProgramAvatar name={name} src={cached?.profilePicture} size="xs" />
      <span className="truncate">{name}</span>
    </>
  );
  const linkClass = cn(
    "relative z-10 inline-flex min-w-0 items-center gap-1.5 text-muted underline-offset-2 hover:text-ink hover:underline",
    className,
  );
  if (cached) {
    return (
      <Link to="/programs/$handle" params={{ handle: cached.handle }} className={linkClass}>
        {content}
      </Link>
    );
  }
  if (item.programUrl) {
    return (
      <ExternalLink href={item.programUrl} className={cn(linkClass, "gap-1.5")}>
        {content}
      </ExternalLink>
    );
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-muted", className)}>{content}</span>
  );
}

/** Props shared by {@link HacktivityRow} and {@link HacktivityCard}. */
export interface HacktivityItemProps {
  item: HacktivityItem;
  /** Opens the detail sheet for this item. */
  onSelect: (item: HacktivityItem) => void;
}

/** One Hacktivity result in the virtualized list view. */
export function HacktivityRow({ item, onSelect }: HacktivityItemProps) {
  const activity = latestActivity(item);
  const duration = timeToDisclose(item.submittedAt, item.disclosedAt);
  return (
    <div className="relative flex h-[76px] w-full flex-col justify-center gap-1 border-b border-line px-5 transition-colors hover:bg-hover">
      <div className="flex w-full items-center gap-3">
        <span className="w-24 shrink-0">
          <SeverityLabel rating={item.severityRating} />
        </span>
        <button
          type="button"
          onClick={() => {
            onSelect(item);
          }}
          className={cn(stretchedButton, "flex-1 truncate text-ink")}
        >
          {item.title ?? "Untitled report"}
        </button>
        {item.totalAwardedAmount ? (
          <span className="shrink-0 font-mono text-success tabular-nums">
            {formatMoney(item.totalAwardedAmount)}
          </span>
        ) : null}
      </div>
      <div className="flex w-full items-center gap-3 text-[13px] text-faint">
        <span className="w-24 shrink-0 font-mono">#{item.id}</span>
        <ProgramLink item={item} className="shrink-0" />
        <span className="min-w-0 truncate">
          {[
            item.reporterUsername ? `by ${item.reporterUsername}` : null,
            item.cwe,
            item.cveIds.join(", ") || null,
            substateLabel(item) || null,
          ]
            .filter(Boolean)
            .join(" Â· ")}
        </span>
        <span className="ml-auto shrink-0">
          <span title={activity.title}>{activity.text}</span>
          {duration ? ` Â· ${duration} to disclose` : ""}
          {item.votes ? ` Â· ${String(item.votes)} votes` : ""}
        </span>
      </div>
    </div>
  );
}

/** One Hacktivity result in the card grid, with a short excerpt of the published summary. */
export function HacktivityCard({ item, onSelect }: HacktivityItemProps) {
  const activity = latestActivity(item);
  const duration = timeToDisclose(item.submittedAt, item.disclosedAt);
  return (
    <div className={cn(cardClass, "relative")}>
      <div className="flex w-full items-center justify-between gap-3 text-[13px]">
        <SeverityLabel rating={item.severityRating} />
        {item.totalAwardedAmount ? (
          <span className="font-mono text-success tabular-nums">{formatMoney(item.totalAwardedAmount)}</span>
        ) : (
          <span className="text-faint">No bounty</span>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          onSelect(item);
        }}
        className={cn(
          stretchedButton,
          "line-clamp-2 min-h-10 text-[14px] leading-5 font-medium text-ink after:rounded-lg",
        )}
      >
        {item.title ?? "Untitled report"}
      </button>
      {item.summary ? (
        <p className="line-clamp-2 text-[12px] leading-[18px] text-muted">{item.summary}</p>
      ) : null}
      <div className="flex w-full items-center gap-2 text-[12px]">
        <ProgramLink item={item} />
        {item.reporterUsername ? (
          <span className="shrink-0 text-faint">by {item.reporterUsername}</span>
        ) : null}
        {duration ? <span className="ml-auto shrink-0 text-faint">{duration} to disclose</span> : null}
      </div>
      <div className="mt-auto flex w-full items-center justify-between gap-3 border-t border-line pt-3 text-[12px] text-faint">
        <span className="truncate">{item.cwe ?? substateLabel(item)}</span>
        <span className="inline-flex shrink-0 items-center gap-2">
          {item.votes ? (
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="size-3" aria-hidden />
              <span className="sr-only">Votes:</span>
              {item.votes}
            </span>
          ) : null}
          <span title={activity.title}>{activity.text}</span>
        </span>
      </div>
    </div>
  );
}

/** Props for {@link HacktivityDetailSheet}. */
export interface HacktivityDetailSheetProps {
  /** The item to show; the sheet keeps rendering it while it animates closed. */
  item: HacktivityItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Side sheet with a Hacktivity item's summary and disclosure timeline. */
export function HacktivityDetailSheet({ item, open, onOpenChange }: HacktivityDetailSheetProps) {
  const activity = latestActivity(item);
  const duration = timeToDisclose(item.submittedAt, item.disclosedAt);
  const facts: [string, ReactNode][] = [
    ["Program", (item.programName ?? item.programHandle) ? <ProgramLink item={item} /> : null],
    ["Reporter", item.reporterUsername],
    ["Weakness", item.cwe],
    ["CVE", item.cveIds.join(", ") || null],
    ["State", substateLabel(item) || null],
    ["Submitted", formatDate(item.submittedAt) || null],
    ["Disclosed", formatDate(item.disclosedAt) || null],
    ["Time to disclose", duration || null],
    ["Latest activity", activity.text || null],
  ];
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={item.title ?? "Untitled report"}
      description={`#${item.id}`}
      className="w-[min(480px,100vw)]"
      footer={
        <Button variant="primary" className="ml-auto" onClick={() => void openOnHackerOne(itemUrl(item))}>
          Open on HackerOne
        </Button>
      }
    >
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>
            <SeverityLabel rating={item.severityRating} />
          </Badge>
          {item.totalAwardedAmount ? (
            <Badge className="font-mono text-success tabular-nums">
              {formatMoney(item.totalAwardedAmount)}
            </Badge>
          ) : null}
          {item.votes ? (
            <Badge>
              <ThumbsUp className="size-3" aria-hidden />
              {item.votes} votes
            </Badge>
          ) : null}
        </div>
        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 text-[13px]">
          {facts
            .filter(([, value]) => value !== null && value !== undefined && value !== "")
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-faint">{label}</dt>
                <dd className="min-w-0 text-ink">{value}</dd>
              </div>
            ))}
        </dl>
        <section aria-label="Summary" className="flex flex-col gap-1">
          <h3 className="text-[13px] font-medium text-faint">Summary</h3>
          {item.summary ? (
            <Markdown source={item.summary} className="selectable text-[13px]" />
          ) : (
            <p className="text-[13px] text-faint">No summary was published with this report.</p>
          )}
        </section>
      </div>
    </Sheet>
  );
}
