import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Dialog as RadixDialog } from "radix-ui";
import { useDeferredValue, useState } from "react";
import { localSearch } from "@/ipc/programs";
import { ProgramAvatar } from "@/components/program-avatar";
import { useProgramLookup } from "@/features/programs/use-programs";
import { reportsCached } from "@/ipc/reports";
import { draftsList } from "@/ipc/workspace";
import { openOnHackerOne } from "@/lib/open-external";
import { Kbd } from "@/components/ui/badge";
import { hackerOne } from "@/domain/deep-links";
import { queryKeys } from "@/query/keys";

interface PaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowShortcuts: () => void;
  username: string | null;
}

const itemClass =
  "flex h-9 cursor-default items-center justify-between gap-3 rounded-md px-2.5 text-[13px] text-muted data-[selected=true]:bg-hover data-[selected=true]:text-ink";
const groupClass =
  "px-1.5 pb-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[13px] [&_[cmdk-group-heading]]:text-faint";

export function CommandPalette({ open, onOpenChange, onShowShortcuts, username }: PaletteProps) {
  const navigate = useNavigate();
  const lookup = useProgramLookup();
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search.trim());
  const hits = useQuery({
    queryKey: queryKeys.search(deferred, ["program", "scope"]),
    queryFn: () => localSearch(deferred, ["program", "scope"], 12),
    enabled: open && deferred.length > 0,
  });
  const reports = useQuery({ queryKey: queryKeys.reports.cached, queryFn: reportsCached, enabled: open });
  const drafts = useQuery({ queryKey: queryKeys.drafts, queryFn: draftsList, enabled: open });

  const run = (action: () => void) => {
    onOpenChange(false);
    setSearch("");
    action();
  };
  const go = (to: string) => () => void navigate({ to });

  const needle = deferred.toLowerCase();
  const matchingReports = (reports.data?.data ?? [])
    .filter(
      (report) =>
        needle && (report.title.toLowerCase().includes(needle) || report.id === needle.replace(/^#/, "")),
    )
    .slice(0, 8);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed top-[14vh] left-1/2 z-50 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-surface"
        >
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          <Command label="Command palette" shouldFilter={false} loop>
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Jump to a program, asset, report or action"
              className="h-12 w-full border-b border-line bg-transparent px-4 text-[14px] text-ink placeholder:text-faint focus:outline-none"
            />
            <Command.List className="max-h-[420px] overflow-y-auto py-1">
              <Command.Empty className="px-4 py-6 text-center text-muted">
                No matches in the local cache.
              </Command.Empty>
              {(hits.data ?? []).length > 0 ? (
                <Command.Group heading="Programs and assets" className={groupClass}>
                  {(hits.data ?? []).map((hit) => (
                    <Command.Item
                      key={`${hit.kind}:${hit.reference}`}
                      value={`${hit.kind}:${hit.reference}`}
                      className={itemClass}
                      onSelect={() => {
                        run(() => {
                          const handle = hit.program ?? hit.reference;
                          void navigate({ to: "/programs/$handle", params: { handle } });
                        });
                      }}
                    >
                      {hit.kind === "program" ? (
                        <ProgramAvatar
                          name={hit.title}
                          src={lookup.get(hit.program ?? hit.reference)?.profilePicture}
                          size="xs"
                        />
                      ) : (
                        <ProgramAvatar
                          name={lookup.get(hit.program ?? "")?.name ?? hit.program ?? hit.title}
                          src={lookup.get(hit.program ?? "")?.profilePicture}
                          size="xs"
                          className="opacity-70"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-ink">{hit.title}</span>
                      <span className="shrink-0 text-faint">
                        {hit.kind === "scope"
                          ? (lookup.get(hit.program ?? "")?.name ?? hit.program)
                          : "Program"}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {matchingReports.length > 0 ? (
                <Command.Group heading="Reports" className={groupClass}>
                  {matchingReports.map((report) => (
                    <Command.Item
                      key={report.id}
                      value={`report:${report.id}`}
                      className={itemClass}
                      onSelect={() => {
                        run(() => void navigate({ to: "/reports/$id", params: { id: report.id } }));
                      }}
                    >
                      <span className="truncate text-ink">{report.title}</span>
                      <span className="shrink-0 font-mono text-faint">#{report.id}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {!needle && (drafts.data ?? []).length > 0 ? (
                <Command.Group heading="Drafts" className={groupClass}>
                  {(drafts.data ?? []).slice(0, 5).map((draft) => (
                    <Command.Item
                      key={draft.id}
                      value={`draft:${draft.id}`}
                      className={itemClass}
                      onSelect={() => {
                        run(() => void navigate({ to: "/compose", search: { draft: draft.id } }));
                      }}
                    >
                      <span className="truncate text-ink">{draft.title || "Untitled draft"}</span>
                      <span className="shrink-0 text-faint">{draft.programHandle ?? "No program"}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Go to" className={groupClass}>
                {[
                  ["Programs", "/programs", "G P"],
                  ["Reports", "/reports", "G R"],
                  ["Report intents", "/intents", "G I"],
                  ["Hacktivity", "/hacktivity", "G H"],
                  ["Earnings", "/earnings", "G E"],
                  ["Settings", "/settings", ""],
                ]
                  .filter(([label]) => !needle || (label ?? "").toLowerCase().includes(needle))
                  .map(([label, to, keys]) => (
                    <Command.Item
                      key={to}
                      value={`go:${to}`}
                      className={itemClass}
                      onSelect={() => {
                        run(go(to ?? "/"));
                      }}
                    >
                      <span>{label}</span>
                      {keys ? <span className="font-mono text-faint">{keys}</span> : null}
                    </Command.Item>
                  ))}
              </Command.Group>
              <Command.Group heading="Actions" className={groupClass}>
                {[
                  { label: "Write a new report", run: () => void navigate({ to: "/compose", search: {} }) },
                  { label: "Show keyboard shortcuts", run: onShowShortcuts },
                  {
                    label: "Open API token settings on HackerOne",
                    run: () => void openOnHackerOne(hackerOne.apiToken),
                  },
                  {
                    label: "Open account settings on HackerOne",
                    run: () => void openOnHackerOne(hackerOne.accountSettings),
                  },
                  {
                    label: "Open two-factor settings on HackerOne",
                    run: () => void openOnHackerOne(hackerOne.twoFactor),
                  },
                  ...(username
                    ? [
                        {
                          label: "Open my profile on HackerOne",
                          run: () => void openOnHackerOne(hackerOne.profile(username)),
                        },
                      ]
                    : []),
                ]
                  .filter((action) => !needle || action.label.toLowerCase().includes(needle))
                  .map((action) => (
                    <Command.Item
                      key={action.label}
                      value={action.label}
                      className={itemClass}
                      onSelect={() => {
                        run(action.run);
                      }}
                    >
                      {action.label}
                    </Command.Item>
                  ))}
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[13px] text-faint">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Enter</Kbd> open
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> close
              </span>
            </div>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
