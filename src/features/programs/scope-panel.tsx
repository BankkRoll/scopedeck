import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ScopeRow } from "@/ipc/programs";
import { EmptyState, SeverityLabel } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { humanize } from "@/domain/format";
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

export function ScopePanel({ scopes }: { scopes: ScopeRow[] }) {
  const [onlySubmittable, setOnlySubmittable] = useState(true);
  const visible = onlySubmittable ? submittableScopes(scopes) : scopes;
  const groups = groupByAssetType(visible);
  const changed = scopes.filter((scope) => scope.changedSinceLastSync).length;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-line px-5 py-2.5">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={onlySubmittable}
            onChange={(event) => {
              setOnlySubmittable(event.target.checked);
            }}
            className="size-3.5 accent-[var(--accent)]"
          />
          Only assets accepting submissions
        </label>
        {changed > 0 ? (
          <span className="text-[13px] text-faint">{changed} changed since the last sync</span>
        ) : null}
        <div className="ml-auto flex gap-2">
          <CopyButton label="Copy list" text={() => scopeExport(visible, "plain")} />
          <CopyButton label="Copy JSON" text={() => scopeExport(visible, "json")} />
        </div>
      </div>
      {groups.length === 0 ? (
        <EmptyState title="No assets">
          This program lists no structured scope for the current filter.
        </EmptyState>
      ) : null}
      {groups.map((group) => (
        <section key={group.assetType} aria-label={humanize(group.assetType.toLowerCase())}>
          <h3 className="sticky top-0 z-[1] border-b border-line bg-ground px-5 py-2 text-[13px] font-medium text-faint">
            {humanize(group.assetType.toLowerCase())} <span className="font-mono">{group.scopes.length}</span>
          </h3>
          <ul>
            {group.scopes.map((scope) => (
              <li
                key={scope.id}
                className="grid grid-cols-[minmax(0,1fr)_120px_120px_110px] items-start gap-4 border-b border-line px-5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="selectable truncate font-mono text-[13px] text-ink">
                      {scope.assetIdentifier}
                    </span>
                    {scope.changedSinceLastSync ? (
                      <Badge className="border-accent text-link">New</Badge>
                    ) : null}
                  </div>
                  {scope.instruction ? (
                    <p className="selectable mt-1 line-clamp-3 text-[13px] whitespace-pre-line text-muted">
                      {scope.instruction}
                    </p>
                  ) : null}
                </div>
                <span className={scope.eligibleForSubmission ? "text-ink" : "text-faint"}>
                  {scope.eligibleForSubmission ? "In scope" : "Out of scope"}
                </span>
                <span className={scope.eligibleForBounty ? "text-ink" : "text-faint"}>
                  {scope.eligibleForBounty ? "Bounty" : "No bounty"}
                </span>
                <SeverityLabel rating={scope.maxSeverity} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
