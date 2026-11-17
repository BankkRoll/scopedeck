import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import type { ScopeRow } from "@/ipc/programs";
import { EmptyState, SeverityLabel } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { assetTypeLabel } from "@/domain/format";
import { cn } from "@/lib/cn";
import { groupByAssetType, scopeExport, submittableScopes } from "@/domain/scope-eligibility";

function CopyButton({ label, text }: { label: string; text: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text());
          setCopied(true);
          window.setTimeout(() => {
            setCopied(false);
          }, 1500);
        } catch {
          toast.error("The clipboard is unavailable");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}

function Flag({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", on ? "text-ink" : "text-faint")}>
      <span className={cn("size-1.5 rounded-full", on ? "bg-success" : "bg-line-strong")} aria-hidden />
      {on ? yes : no}
    </span>
  );
}

function CopyAsset({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => {
            setCopied(false);
          }, 1200);
        } catch {
          toast.error("The clipboard is unavailable");
        }
      }}
      className="rounded-sm p-0.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </button>
  );
}

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_130px_120px_120px] items-start gap-4 px-5";

export function ScopePanel({ scopes }: { scopes: ScopeRow[] }) {
  const switchId = useId();
  const [onlySubmittable, setOnlySubmittable] = useState(true);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = (onlySubmittable ? submittableScopes(scopes) : scopes).filter(
    (scope) =>
      !needle ||
      scope.assetIdentifier.toLowerCase().includes(needle) ||
      (scope.instruction ?? "").toLowerCase().includes(needle),
  );
  const groups = groupByAssetType(visible);
  const changed = scopes.filter((scope) => scope.changedSinceLastSync).length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-4 border-b border-line px-5 py-2.5">
        <Input
          type="search"
          aria-label="Filter assets"
          placeholder="Filter assets"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          className="max-w-64"
        />
        <div className="flex items-center gap-2">
          <Switch id={switchId} checked={onlySubmittable} onCheckedChange={setOnlySubmittable} />
          <label htmlFor={switchId} className="text-[13px] text-muted">
            Only assets accepting submissions
          </label>
        </div>
        {changed > 0 ? (
          <Badge className="border-accent/50 text-link">{changed} new since last sync</Badge>
        ) : null}
        <div className="ml-auto flex gap-2">
          <CopyButton label="Copy list" text={() => scopeExport(visible, "plain")} />
          <CopyButton label="Copy JSON" text={() => scopeExport(visible, "json")} />
        </div>
      </div>
      {groups.length === 0 ? (
        <EmptyState title={needle ? "No assets match" : "No assets"}>
          {needle
            ? "Try a different filter."
            : "This program lists no structured scope for the current filter."}
        </EmptyState>
      ) : (
        <div
          className={cn(ROW_GRID, "border-b border-line py-2 text-[12px] font-medium text-faint")}
          aria-hidden
        >
          <span>Asset</span>
          <span>Submissions</span>
          <span>Bounty</span>
          <span>Max severity</span>
        </div>
      )}
      {groups.map((group) => (
        <section key={group.assetType} aria-label={assetTypeLabel(group.assetType)}>
          <h3 className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-surface px-5 py-1.5 text-[12px] font-medium text-muted">
            {assetTypeLabel(group.assetType)}
            <span className="font-mono text-faint">{group.scopes.length}</span>
          </h3>
          <ul>
            {group.scopes.map((scope) => (
              <li
                key={scope.id}
                className={cn(ROW_GRID, "group border-b border-line py-2.5 hover:bg-hover/40")}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="selectable truncate font-mono text-[13px] text-ink">
                      {scope.assetIdentifier}
                    </span>
                    <CopyAsset value={scope.assetIdentifier} />
                    {scope.changedSinceLastSync ? (
                      <Badge className="border-accent/50 text-link">New</Badge>
                    ) : null}
                  </div>
                  {scope.instruction ? (
                    <p className="selectable mt-1 line-clamp-3 text-[13px] whitespace-pre-line text-muted">
                      {scope.instruction}
                    </p>
                  ) : null}
                </div>
                <Flag on={scope.eligibleForSubmission} yes="In scope" no="Out of scope" />
                <Flag on={scope.eligibleForBounty} yes="Bounty" no="No bounty" />
                <SeverityLabel rating={scope.maxSeverity} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
