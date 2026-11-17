/**
 * The composer's AI assistant.
 *
 * Responsibilities:
 * - Gate every request on the assistant being enabled and, for hosted providers, on the hacker
 *   allowing the current program, since many programs forbid sharing findings with third parties.
 * - Run four actions (draft from notes, title ideas, rewrite a section, policy check) and show
 *   the result as a preview. Nothing is written to the draft until the hacker applies it.
 */
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, Info, ShieldAlert, Sparkles } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { z } from "zod";
import { aiComplete } from "@/ipc/ai";
import { toAppError } from "@/ipc/errors";
import type { DraftContent } from "@/ipc/workspace";
import { ErrorNotice } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  REWRITE_ACTIONS,
  cleanTextReply,
  draftFromNotesPrompt,
  parseDraftReply,
  parsePolicyReply,
  parseTitlesReply,
  policyCheckPrompt,
  rewritePrompt,
  titlePrompt,
  type AssistantProgramContext,
  type AssistantPrompt,
  type DraftReply,
  type PolicyFinding,
  type RewriteAction,
} from "@/domain/ai-prompts";
import { humanize } from "@/domain/format";
import { usePersistedState } from "@/lib/persisted-state";
import { cn } from "@/lib/cn";
import { PROVIDER_INFO, useAiSettings } from "@/features/settings/ai-config";

/** Props for {@link AssistantSheet}. */
export interface AssistantSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: DraftContent;
  program: AssistantProgramContext | null;
  onApply: (patch: Partial<DraftContent>) => void;
}

const UNUSABLE = "The model replied in an unexpected format. Try again, or use a larger model.";

async function run(prompt: AssistantPrompt): Promise<string> {
  const { text } = await aiComplete(prompt);
  return text;
}

function Panel({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[13px] font-medium text-ink">{title}</h3>
        <p className="text-[12px] text-faint">{detail}</p>
      </div>
      {children}
    </section>
  );
}

function Preview({
  children,
  onApply,
  onDiscard,
}: {
  children: ReactNode;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="bg-canvas flex flex-col gap-2 rounded-md border border-line p-3">
      <div className="max-h-72 overflow-y-auto text-[13px] whitespace-pre-wrap text-muted">{children}</div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={onApply}>
          Apply
        </Button>
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </div>
  );
}

/** A side panel that drafts, rewrites and checks the current report with the configured model. */
export function AssistantSheet({ open, onOpenChange, content, program, onApply }: AssistantSheetProps) {
  const settings = useAiSettings();
  const [allowed, setAllowed] = usePersistedState("ai.allowedPrograms", z.array(z.string()), []);
  const config = settings.data;
  const info = config ? PROVIDER_INFO[config.provider] : null;
  const consentKey = program?.handle ?? "";
  const permitted = Boolean(info?.local) || (consentKey !== "" && allowed.includes(consentKey));

  let body: ReactNode;
  if (!config) {
    body = settings.isError ? <ErrorNotice error={toAppError(settings.error)} /> : null;
  } else if (!config.enabled) {
    body = (
      <Notice icon={<Info />}>
        The assistant is off. Turn it on and choose a provider in{" "}
        <Link to="/settings" className="text-accent underline-offset-2 hover:underline">
          Settings
        </Link>
        .
      </Notice>
    );
  } else if (!program) {
    body = (
      <Notice icon={<Info />}>Choose a program first, so the assistant knows the scope and policy.</Notice>
    );
  } else if (!permitted) {
    body = (
      <div className="flex flex-col gap-3">
        <Notice icon={<ShieldAlert />} tone="warning">
          Using the assistant sends this draft to {info?.label ?? "the provider"}. Many programs forbid
          sharing undisclosed vulnerability details with third parties. Check the {program.name} policy before
          you continue.
        </Notice>
        <Button
          variant="primary"
          onClick={() => {
            setAllowed((current) => [...new Set([...current, consentKey])]);
          }}
        >
          Allow for {program.name}
        </Button>
      </div>
    );
  } else {
    body = (
      <Actions
        content={content}
        program={program}
        onApply={onApply}
        onRevoke={
          info?.local
            ? undefined
            : () => {
                setAllowed((current) => current.filter((handle) => handle !== consentKey));
              }
        }
      />
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Assistant"
      description={config ? `${info?.label ?? ""} · ${config.model}` : undefined}
      className="w-[min(480px,100vw)]"
    >
      <div className="p-5">{body}</div>
    </Sheet>
  );
}

function Notice({
  icon,
  tone = "info",
  children,
}: {
  icon: ReactNode;
  tone?: "info" | "warning";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-md border p-3 text-[13px] [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "warning"
          ? "border-warning/40 bg-warning/5 text-ink [&>svg]:text-warning"
          : "border-line text-muted",
      )}
    >
      {icon}
      <p>{children}</p>
    </div>
  );
}

function Actions({
  content,
  program,
  onApply,
  onRevoke,
}: {
  content: DraftContent;
  program: AssistantProgramContext;
  onApply: (patch: Partial<DraftContent>) => void;
  onRevoke: (() => void) | undefined;
}) {
  const notesId = useId();
  const [notes, setNotes] = useState("");
  const [field, setField] = useState<"vulnerabilityInformation" | "impact">("vulnerabilityInformation");

  const draft = useMutation({
    mutationFn: async (): Promise<DraftReply> => {
      const reply = parseDraftReply(await run(draftFromNotesPrompt(notes, program)));
      if (!reply) throw new Error(UNUSABLE);
      return reply;
    },
  });
  const titles = useMutation({
    mutationFn: async () => {
      const reply = parseTitlesReply(await run(titlePrompt(content, program)));
      if (!reply) throw new Error(UNUSABLE);
      return reply;
    },
  });
  const rewrite = useMutation({
    mutationFn: async (action: RewriteAction) => {
      const text = cleanTextReply(await run(rewritePrompt(action, content[field], program)));
      if (!text) throw new Error(UNUSABLE);
      return { field, text };
    },
  });
  const policy = useMutation({
    mutationFn: async (): Promise<PolicyFinding[]> => {
      const reply = parsePolicyReply(await run(policyCheckPrompt(content, program)));
      if (!reply) throw new Error(UNUSABLE);
      return reply;
    },
  });

  return (
    <Tabs defaultValue="draft" className="flex flex-col gap-4">
      <TabsList className="-mx-5 px-5">
        <TabsTrigger value="draft">Draft</TabsTrigger>
        <TabsTrigger value="rewrite">Rewrite</TabsTrigger>
        <TabsTrigger value="policy">Policy check</TabsTrigger>
      </TabsList>

      <TabsContent value="draft" className="flex flex-col gap-6">
        <Panel
          title="Draft from notes"
          detail="Paste rough notes, requests or a transcript. The assistant writes the title, body and impact."
        >
          <Field label="Notes" htmlFor={notesId}>
            <Textarea
              id={notesId}
              rows={8}
              value={notes}
              placeholder="bio field on /settings/profile renders html, <img src=x onerror=alert(1)> fires for admins viewing the user list"
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </Field>
          <Button
            variant="primary"
            disabled={!notes.trim() || draft.isPending}
            onClick={() => {
              draft.mutate();
            }}
          >
            <Sparkles />
            {draft.isPending ? "Writing" : "Write draft"}
          </Button>
          {draft.isError ? <ErrorNotice error={toAppError(draft.error)} /> : null}
          {draft.data ? (
            <Preview
              onDiscard={() => {
                draft.reset();
              }}
              onApply={() => {
                const reply = draft.data;
                onApply({
                  title: reply.title,
                  vulnerabilityInformation: reply.vulnerabilityInformation,
                  impact: reply.impact,
                  ...(reply.severity ? { severityRating: reply.severity } : {}),
                });
                draft.reset();
              }}
            >
              <strong className="text-ink">{draft.data.title}</strong>
              {draft.data.severity ? `\nSeverity: ${humanize(draft.data.severity)}` : ""}
              {`\n\n${draft.data.vulnerabilityInformation}\n\n## Impact\n\n${draft.data.impact}`}
            </Preview>
          ) : null}
          {content.vulnerabilityInformation.trim() || content.impact.trim() ? (
            <p className="text-[12px] text-faint">Applying replaces the current title, body and impact.</p>
          ) : null}
        </Panel>

        <Panel title="Title ideas" detail="Three specific titles based on the current draft.">
          <Button
            disabled={titles.isPending || !content.vulnerabilityInformation.trim()}
            onClick={() => {
              titles.mutate();
            }}
          >
            {titles.isPending ? "Thinking" : "Suggest titles"}
          </Button>
          {titles.isError ? <ErrorNotice error={toAppError(titles.error)} /> : null}
          {titles.data ? (
            <ul className="flex flex-col gap-1">
              {titles.data.map((title) => (
                <li key={title}>
                  <button
                    type="button"
                    onClick={() => {
                      onApply({ title });
                    }}
                    className="w-full rounded-md border border-line px-3 py-2 text-left text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-raised"
                  >
                    {title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </TabsContent>

      <TabsContent value="rewrite" className="flex flex-col gap-4">
        <Panel title="Rewrite a section" detail="Facts, URLs, payloads and code blocks are kept as written.">
          <div role="radiogroup" aria-label="Section" className="grid grid-cols-2 gap-1">
            {(
              [
                ["vulnerabilityInformation", "Vulnerability information"],
                ["impact", "Impact"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={field === value}
                onClick={() => {
                  setField(value);
                  rewrite.reset();
                }}
                className="h-8 rounded-md border border-line text-[13px] text-muted transition-colors hover:text-ink aria-checked:border-line-strong aria-checked:bg-raised aria-checked:text-ink"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {REWRITE_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={rewrite.isPending || !content[field].trim()}
                onClick={() => {
                  rewrite.mutate(action.id);
                }}
                className="flex flex-col items-start gap-0.5 rounded-md border border-line p-2.5 text-left transition-colors hover:border-line-strong hover:bg-raised disabled:pointer-events-none disabled:opacity-45"
              >
                <span className="text-[13px] text-ink">{action.label}</span>
                <span className="text-[12px] text-faint">{action.detail}</span>
              </button>
            ))}
          </div>
          {!content[field].trim() ? <p className="text-[12px] text-faint">This section is empty.</p> : null}
          {rewrite.isPending ? <p className="text-[13px] text-faint">Rewriting</p> : null}
          {rewrite.isError ? <ErrorNotice error={toAppError(rewrite.error)} /> : null}
          {rewrite.data ? (
            <Preview
              onDiscard={() => {
                rewrite.reset();
              }}
              onApply={() => {
                onApply({ [rewrite.data.field]: rewrite.data.text });
                rewrite.reset();
              }}
            >
              {rewrite.data.text}
            </Preview>
          ) : null}
        </Panel>
      </TabsContent>

      <TabsContent value="policy" className="flex flex-col gap-4">
        <Panel
          title="Check against the policy"
          detail={`Reads the ${program.name} policy and exclusions and flags anything likely to get the report closed.`}
        >
          <Button
            variant="primary"
            disabled={policy.isPending}
            onClick={() => {
              policy.mutate();
            }}
          >
            <Sparkles />
            {policy.isPending ? "Checking" : "Run policy check"}
          </Button>
          {!program.policy ? (
            <p className="text-[12px] text-faint">
              This program has no policy text cached; only exclusions are checked.
            </p>
          ) : null}
          {policy.isError ? <ErrorNotice error={toAppError(policy.error)} /> : null}
          {policy.data ? (
            policy.data.length === 0 ? (
              <p className="text-[13px] text-muted">No policy problems found.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {policy.data.map((finding, index) => (
                  <li
                    key={index}
                    className="flex gap-2.5 rounded-md border border-line p-2.5 text-[13px] [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0"
                  >
                    {finding.level === "note" ? (
                      <Info className="text-faint" />
                    ) : (
                      <CircleAlert className={finding.level === "blocker" ? "text-danger" : "text-warning"} />
                    )}
                    <span>
                      <span className="mr-1.5 font-medium text-ink">{humanize(finding.level)}</span>
                      <span className="text-muted">{finding.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </Panel>
      </TabsContent>

      {onRevoke ? (
        <button
          type="button"
          onClick={onRevoke}
          className="self-start text-[12px] text-faint underline-offset-2 hover:text-ink hover:underline"
        >
          Stop allowing the assistant for {program.name}
        </button>
      ) : null}
    </Tabs>
  );
}
