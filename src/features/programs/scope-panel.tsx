import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { describeError, toAppError } from "@/ipc/errors";
import type { ScopeRow } from "@/ipc/programs";
import { saveTextFile } from "@/ipc/system";
import { EmptyState, SeverityLabel } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Select, itemClass, popoverClass, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { assetTypeLabel, formatDate, formatRelative, humanize } from "@/domain/format";
import { ciaRequirements, scopeTimestamp, sortScopesNewestFirst } from "@/domain/program-insights";
import { cn } from "@/lib/cn";
import {
  RECON_FORMATS,
  groupByAssetType,
  reconExport,
  submittableScopes,
  type ReconFormatInfo,
} from "@/domain/scope-eligibility";

interface ExportOutput {
  format: ReconFormatInfo;
  text: string;
}

async function copyExport({ format, text }: ExportOutput) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${format.label.toLowerCase()}`);
  } catch {
    toast.error("The clipboard is unavailable");
  }
}

async function saveExport({ format, text }: ExportOutput) {
  const name = `scope-${format.id}.${format.extension}`;
  try {
    if (await saveTextFile(name, format.extension, text)) toast.success(`Saved ${name}`);
  } catch (error) {
    toast.error(describeError(toAppError(error)).title);
  }
}

function ExportItems({
  outputs,
  onPick,
}: {
  outputs: readonly ExportOutput[];
  onPick: (output: ExportOutput) => Promise<void>;
}) {
  return outputs.map((output) => (
    <DropdownMenu.Item
      key={output.format.id}
      disabled={output.text === ""}
      onSelect={() => void onPick(output)}
      className={itemClass}
    >
      {output.format.label}
      <span className="ml-auto pl-6 text-[12px] text-faint">{output.format.hint}</span>
    </DropdownMenu.Item>
  ));
}

const menuClass = cn(popoverClass, "min-w-60 p-1");

/** Mounted only while the menu is open, so exports are built on demand rather than per render. */
function ExportContent({
  visible,
  matching,
}: {
  visible: readonly ScopeRow[];
  matching: readonly ScopeRow[];
}) {
  const outputs = useMemo(
    () =>
      RECON_FORMATS.map((format) => ({
        format,
        // NOTE: Tool formats read `matching` (search only, not the eligibility switch) so Burp
        // can still emit exclude rules for out-of-scope assets the panel is hiding.
        text: reconExport(format.id === "plain" || format.id === "json" ? visible : matching, format.id),
      })),
    [visible, matching],
  );
  return (
    <DropdownMenu.Content align="end" sideOffset={4} className={menuClass}>
      <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-[12px] text-faint">Copy</DropdownMenu.Label>
      <ExportItems outputs={outputs} onPick={copyExport} />
      <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-line" />
      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger className={cn(itemClass, "data-[state=open]:bg-hover")}>
          Save as file…
          <ChevronRight className="ml-auto size-3.5 text-faint" />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.Portal>
          <DropdownMenu.SubContent sideOffset={6} className={menuClass}>
            <ExportItems outputs={outputs} onPick={saveExport} />
          </DropdownMenu.SubContent>
        </DropdownMenu.Portal>
      </DropdownMenu.Sub>
    </DropdownMenu.Content>
  );
}

function ExportMenu(props: { visible: readonly ScopeRow[]; matching: readonly ScopeRow[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button size="sm">
          <Download />
          Export
          <ChevronDown className="text-faint" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <ExportContent {...props} />
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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

function AssetMeta({ scope, showType }: { scope: ScopeRow; showType: boolean }) {
  const stamp = scopeTimestamp(scope);
  const cia = ciaRequirements(scope);
  if (!stamp && cia.length === 0 && !showType) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-faint">
      {showType ? <span className="text-muted">{assetTypeLabel(scope.assetType)}</span> : null}
      {stamp ? (
        <span title={formatDate(stamp.at)}>
          {stamp.kind} {formatRelative(stamp.at)}
        </span>
      ) : null}
      {cia.length > 0 ? (
        <span
          className="font-mono"
          title={cia.map((req) => `${req.label} requirement: ${humanize(req.value)}`).join("\n")}
          aria-label={cia.map((req) => `${req.label} ${req.value}`).join(", ")}
        >
          {cia.map((req) => `${req.key}:${req.value.charAt(0).toUpperCase()}`).join(" ")}
        </span>
      ) : null}
    </p>
  );
}

type ScopeOrder = "default" | "newest";

const ORDER_OPTIONS: SelectOption<ScopeOrder>[] = [
  { value: "default", label: "Group by type" },
  { value: "newest", label: "Newest first" },
];

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_130px_120px_120px] items-start gap-4 px-5";

/**
 * A program's structured scope grouped by asset type (or as one list, newest first), with search,
 * an eligibility switch and an export menu for recon tooling.
 */
export function ScopePanel({ scopes }: { scopes: ScopeRow[] }) {
  const switchId = useId();
  const [onlySubmittable, setOnlySubmittable] = useState(true);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<ScopeOrder>("default");
  const needle = query.trim().toLowerCase();
  const matching = useMemo(
    () =>
      scopes.filter(
        (scope) =>
          !needle ||
          scope.assetIdentifier.toLowerCase().includes(needle) ||
          (scope.instruction ?? "").toLowerCase().includes(needle),
      ),
    [scopes, needle],
  );
  const visible = useMemo(
    () => (onlySubmittable ? submittableScopes(matching) : matching),
    [matching, onlySubmittable],
  );
  const groups = useMemo(
    () =>
      order === "newest"
        ? visible.length
          ? [{ assetType: "", scopes: sortScopesNewestFirst(visible) }]
          : []
        : groupByAssetType(visible),
    [order, visible],
  );
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
          <Select
            aria-label="Order assets"
            value={order}
            onValueChange={setOrder}
            options={ORDER_OPTIONS}
            className="w-36"
          />
          <ExportMenu visible={visible} matching={matching} />
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
        <section
          key={group.assetType || "all"}
          aria-label={group.assetType ? assetTypeLabel(group.assetType) : "Assets, newest first"}
        >
          {group.assetType ? (
            <h3 className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-surface px-5 py-1.5 text-[12px] font-medium text-muted">
              {assetTypeLabel(group.assetType)}
              <span className="font-mono text-faint">{group.scopes.length}</span>
            </h3>
          ) : null}
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
                  <AssetMeta scope={scope} showType={!group.assetType} />
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
