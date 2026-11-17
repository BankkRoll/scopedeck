import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Paperclip, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { SeverityRating } from "@/ipc/common";
import { describeError, toAppError } from "@/ipc/errors";
import { draftAttachmentRemove, draftAttachmentsPick, draftDelete } from "@/ipc/workspace";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ErrorNotice, PageHeader } from "@/components/status";
import { Kbd } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgramAvatar } from "@/components/program-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TITLE_LIMIT,
  canSubmit,
  submissionPath,
  toNewReport,
  validateDraft,
  type ComposerField,
} from "@/domain/composer-validation";
import { assetTypeLabel, formatBytes, formatRelative, humanize } from "@/domain/format";
import { intentDescription } from "@/domain/intent-description";
import { groupByAssetType, submittableScopes } from "@/domain/scope-eligibility";
import { cn } from "@/lib/cn";
import { MOD_LABEL } from "@/features/shell/shortcuts";
import { usePrograms, useProgram } from "@/features/programs/use-programs";
import { queryKeys } from "@/query/keys";
import { DraftsDialog } from "./drafts-dialog";
import { ImportDialog } from "./import-dialog";
import { SubmitDialog, type SubmitPlan } from "./submit-dialog";
import { TemplatesDialog } from "./templates-dialog";
import { useDraft, type SaveState } from "./use-draft";

const SEVERITIES: SeverityRating[] = ["none", "low", "medium", "high", "critical"];

const SEVERITY_DOT: Record<SeverityRating, string> = {
  none: "bg-sev-none",
  low: "bg-sev-low",
  medium: "bg-sev-medium",
  high: "bg-sev-high",
  critical: "bg-sev-critical",
};

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "saving") return <span>Saving</span>;
  if (state.kind === "saved") return <span>Saved {formatRelative(state.at)}</span>;
  if (state.kind === "failed") return <span className="text-danger">{describeError(state.error).title}</span>;
  return <span>Drafts save as you type</span>;
}

interface EditorSession {
  key: number;
  draftId: string | undefined;
  program: string | undefined;
}

/**
 * Each draft gets a fresh editor instance. When the editor saves a brand new draft, the URL is
 * updated to point at it without remounting, so typing is never interrupted.
 */
export function ComposerPage() {
  const search = useSearch({ from: "/compose" });
  const navigate = useNavigate();
  const [session, setSession] = useState<EditorSession>({
    key: 0,
    draftId: search.draft,
    program: search.program,
  });
  const [ownedId, setOwnedId] = useState<string | undefined>(search.draft);
  if (search.draft !== ownedId) {
    setOwnedId(search.draft);
    setSession((current) => ({ key: current.key + 1, draftId: search.draft, program: search.program }));
  }
  return (
    <Composer
      key={session.key}
      draftId={session.draftId}
      initialProgram={session.program}
      onCreated={(id) => {
        setOwnedId(id);
        void navigate({ to: "/compose", search: { draft: id }, replace: true });
      }}
    />
  );
}

interface ComposerProps {
  draftId: string | undefined;
  initialProgram: string | undefined;
  onCreated: (id: string) => void;
}

function Composer({ draftId, initialProgram, onCreated }: ComposerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const draft = useDraft(draftId, initialProgram);
  const { content, update } = draft;
  const programs = usePrograms();
  const program = useProgram(content.programHandle);
  const [attempted, setAttempted] = useState(false);
  const [dialog, setDialog] = useState<"import" | "templates" | "drafts" | "submit" | null>(null);
  const [plan, setPlan] = useState<SubmitPlan | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const ids = { program: useId(), asset: useId(), weakness: useId(), title: useId() };

  const announced = useRef(false);
  useEffect(() => {
    if (!announced.current && draft.id && draft.id !== draftId) {
      announced.current = true;
      onCreated(draft.id);
    }
  }, [draft.id, draftId, onCreated]);

  const detail = program.data;
  const context = useMemo(
    () =>
      detail
        ? {
            scopes: detail.scopes,
            weaknesses: detail.weaknesses,
            exclusions: detail.exclusions,
          }
        : null,
    [detail],
  );
  const problems = useMemo(
    () => validateDraft(content, context ?? { scopes: [], weaknesses: [], exclusions: [] }),
    [content, context],
  );
  const blocking = problems.filter((problem) => problem.blocking);
  const problemFor = (field: ComposerField) =>
    attempted ? problems.find((problem) => problem.field === field)?.message : undefined;

  const programOptions = useMemo<ComboboxOption[]>(
    () =>
      (programs.data ?? [])
        .filter((row) => row.submissionState === "open" || row.handle === content.programHandle)
        .toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name))
        .map((row) => ({
          value: row.handle,
          label: row.name,
          detail: row.handle,
          group: row.pinned ? "Pinned" : "Programs",
          icon: <ProgramAvatar name={row.name} src={row.profilePicture} size="xs" />,
        })),
    [programs.data, content.programHandle],
  );
  const assetOptions = useMemo<ComboboxOption[]>(
    () =>
      groupByAssetType(submittableScopes(detail?.scopes ?? [])).flatMap((group) =>
        group.scopes.map((scope) => ({
          value: scope.id,
          label: scope.assetIdentifier,
          group: assetTypeLabel(group.assetType),
          detail: scope.eligibleForBounty ? undefined : "No bounty",
        })),
      ),
    [detail],
  );
  const weaknessOptions = useMemo<ComboboxOption[]>(
    () =>
      (detail?.weaknesses ?? [])
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .map((weakness) => ({
          value: weakness.id,
          label: weakness.name,
          detail: weakness.externalId?.toUpperCase(),
        })),
    [detail],
  );

  const review = useCallback(async () => {
    setAttempted(true);
    const draftId = await draft.flush();
    const report = toNewReport(content);
    if (!report || !canSubmit(problems) || !detail) {
      toast.error("Fix the highlighted fields before submitting");
      return;
    }
    const path = submissionPath({
      attachmentCount: draft.attachments.length,
      intentSupport: detail.reportIntents,
    });
    if (path === "intent" && draftId) {
      const scope = detail.scopes.find((candidate) => candidate.id === content.structuredScopeId);
      const weakness = detail.weaknesses.find((candidate) => candidate.id === content.weaknessId);
      setPlan({
        path: "intent",
        draftId,
        teamHandle: report.teamHandle,
        description: intentDescription(content, scope, weakness),
        attachments: draft.attachments,
        intentId: draft.intentId,
      });
    } else {
      setPlan({ path: "direct", report });
    }
    setDialog("submit");
  }, [content, detail, draft, problems]);

  const onSubmitted = async (reportId: string | null) => {
    setDialog(null);
    if (draft.id) await draftDelete(draft.id).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: queryKeys.drafts });
    toast.success(reportId ? `Report #${reportId} submitted` : "Report submitted");
    if (reportId) void navigate({ to: "/reports/$id", params: { id: reportId } });
    else void navigate({ to: "/reports" });
  };

  const pickAttachments = async () => {
    setAttachmentError(null);
    const id = await draft.flush();
    if (!id) {
      setAttachmentError("Write something first so the draft can be saved.");
      return;
    }
    try {
      const updated = await draftAttachmentsPick(id);
      queryClient.setQueryData(queryKeys.draft(id), updated);
    } catch (error) {
      setAttachmentError(describeError(toAppError(error)).title);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!draft.id) return;
    const updated = await draftAttachmentRemove(draft.id, attachmentId);
    queryClient.setQueryData(queryKeys.draft(draft.id), updated);
  };

  const submitShortcut = useCallback(() => void review(), [review]);
  const path = detail
    ? submissionPath({ attachmentCount: draft.attachments.length, intentSupport: detail.reportIntents })
    : "direct";

  return (
    <>
      <PageHeader
        title={content.title.trim() || "New report"}
        meta={<SaveIndicator state={draft.saveState} />}
        actions={
          <>
            <Button
              onClick={() => {
                setDialog("drafts");
              }}
            >
              Drafts
            </Button>
            <Button
              onClick={() => {
                setDialog("templates");
              }}
            >
              Templates
            </Button>
            <Button
              onClick={() => {
                setDialog("import");
              }}
            >
              Import JSON
            </Button>
            <Button variant="primary" onClick={() => void review()} title={`${MOD_LABEL}+Enter`}>
              Review and submit
              <Kbd className="border-transparent bg-black/20 text-accent-ink">{MOD_LABEL}↵</Kbd>
            </Button>
          </>
        }
      />
      {draft.loadError ? <ErrorNotice error={draft.loadError} className="mx-5 mt-3" /> : null}
      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)]">
        <aside
          className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-line p-5"
          aria-label="Report details"
        >
          <Field label="Program" htmlFor={ids.program} error={problemFor("programHandle")}>
            <Combobox
              id={ids.program}
              value={content.programHandle}
              invalid={Boolean(problemFor("programHandle"))}
              placeholder="Choose a program"
              searchPlaceholder="Search programs"
              emptyText="No open programs match"
              options={programOptions}
              onChange={(programHandle) => {
                update({
                  programHandle,
                  structuredScopeId: null,
                  weaknessId: null,
                  acknowledgedExclusions: [],
                });
              }}
            />
          </Field>

          <Field
            label="Asset"
            htmlFor={ids.asset}
            error={problemFor("structuredScopeId")}
            hint={detail ? `${submittableScopes(detail.scopes).length} assets accept submissions` : undefined}
          >
            <Combobox
              id={ids.asset}
              value={content.structuredScopeId}
              disabled={!detail}
              placeholder={program.syncing && !detail ? "Loading scope" : "Choose a program first"}
              noneLabel={detail ? "No specific asset" : undefined}
              searchPlaceholder="Search assets"
              options={assetOptions}
              onChange={(structuredScopeId) => {
                update({ structuredScopeId });
              }}
            />
          </Field>

          <Field label="Weakness" htmlFor={ids.weakness} error={problemFor("weaknessId")}>
            <Combobox
              id={ids.weakness}
              value={content.weaknessId}
              disabled={!detail}
              placeholder="Choose a program first"
              noneLabel={detail ? "No weakness selected" : undefined}
              searchPlaceholder="Search by name or CWE"
              options={weaknessOptions}
              onChange={(weaknessId) => {
                update({ weaknessId });
              }}
            />
          </Field>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[13px] font-medium text-muted">Severity</legend>
            <div role="radiogroup" aria-label="Severity" className="grid grid-cols-5 gap-1">
              {SEVERITIES.map((rating) => (
                <button
                  key={rating}
                  type="button"
                  role="radio"
                  aria-checked={content.severityRating === rating}
                  onClick={() => {
                    update({ severityRating: content.severityRating === rating ? null : rating });
                  }}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-line px-1 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink aria-checked:border-line-strong aria-checked:bg-raised aria-checked:text-ink"
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_DOT[rating])} aria-hidden />
                  {humanize(rating)}
                </button>
              ))}
            </div>
            {problemFor("severityRating") ? (
              <p className="text-[13px] text-warning">{problemFor("severityRating")}</p>
            ) : null}
          </fieldset>

          <section aria-label="Attachments" className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-muted">Attachments</h2>
              <Button size="sm" onClick={() => void pickAttachments()}>
                <Paperclip />
                Add files
              </Button>
            </div>
            {draft.attachments.length > 0 ? (
              <ul className="divide-y divide-line border-y border-line">
                {draft.attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
                    <span className="font-mono text-faint">{formatBytes(attachment.size)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${attachment.fileName}`}
                      onClick={() => void removeAttachment(attachment.id)}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[13px] text-faint">
              {draft.attachments.length === 0
                ? "Reports with attachments are sent through a report intent."
                : path === "intent"
                  ? "This report will go through a report intent so the files upload with it."
                  : "This program does not accept report intents, so files must be added on HackerOne after submitting."}
            </p>
            {attachmentError ? <p className="text-[13px] text-danger">{attachmentError}</p> : null}
          </section>

          {detail && detail.exclusions.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-medium text-muted">Not in an excluded category</legend>
              {detail.exclusions.map((exclusion) => {
                const checked = content.acknowledgedExclusions.includes(exclusion.id);
                return (
                  <label key={exclusion.id} className="flex items-start gap-2.5 text-[13px]">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        update({
                          acknowledgedExclusions: next
                            ? [...content.acknowledgedExclusions, exclusion.id]
                            : content.acknowledgedExclusions.filter((id) => id !== exclusion.id),
                        });
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-ink">{exclusion.category ?? "Uncategorised"}</span>
                      {exclusion.details ? (
                        <span className="block text-faint">{exclusion.details}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
              {problemFor("acknowledgedExclusions") ? (
                <p className="text-[13px] text-danger">{problemFor("acknowledgedExclusions")}</p>
              ) : null}
            </fieldset>
          ) : null}

          {attempted && blocking.length > 0 ? (
            <p className="text-[13px] text-danger" role="status">
              {blocking.length === 1 ? "1 field needs attention" : `${blocking.length} fields need attention`}
            </p>
          ) : null}
        </aside>

        <section className="flex min-h-0 flex-col" aria-label="Report body">
          <div className="border-b border-line px-5 py-3">
            <label htmlFor={ids.title} className="sr-only">
              Title
            </label>
            <input
              id={ids.title}
              value={content.title}
              maxLength={TITLE_LIMIT + 50}
              onChange={(event) => {
                update({ title: event.target.value });
              }}
              placeholder="Report title"
              aria-invalid={Boolean(problemFor("title"))}
              className={cn(
                "w-full bg-transparent text-[18px] font-semibold tracking-tight text-ink placeholder:text-faint focus:outline-none",
              )}
            />
            {problemFor("title") ? (
              <p className="mt-1 text-[13px] text-danger">{problemFor("title")}</p>
            ) : null}
          </div>
          <Tabs defaultValue="vulnerability" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="vulnerability">
                Vulnerability information
                {problemFor("vulnerabilityInformation") ? (
                  <span className="size-1.5 rounded-full bg-danger" aria-label="needs attention" />
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="impact">
                Impact
                {problemFor("impact") ? (
                  <span className="size-1.5 rounded-full bg-danger" aria-label="needs attention" />
                ) : null}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="vulnerability" className="flex min-h-0 flex-col overflow-hidden">
              <MarkdownEditor
                label="Vulnerability information"
                value={content.vulnerabilityInformation}
                onChange={(value) => {
                  update({ vulnerabilityInformation: value });
                }}
                placeholder="Summary, steps to reproduce and proof of concept, in markdown"
                onSubmitShortcut={submitShortcut}
              />
            </TabsContent>
            <TabsContent value="impact" className="flex min-h-0 flex-col overflow-hidden">
              <MarkdownEditor
                label="Impact"
                value={content.impact}
                onChange={(value) => {
                  update({ impact: value });
                }}
                placeholder="What an attacker gains, and who is affected"
                onSubmitShortcut={submitShortcut}
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <ImportDialog
        open={dialog === "import"}
        onOpenChange={(open) => {
          setDialog(open ? "import" : null);
        }}
        context={context}
        onApply={(result) => {
          update(result.content);
          if (result.issues.length > 0) toast(`${result.issues.length} imported fields need attention`);
        }}
      />
      <TemplatesDialog
        open={dialog === "templates"}
        onOpenChange={(open) => {
          setDialog(open ? "templates" : null);
        }}
        current={{
          title: content.title,
          vulnerabilityInformation: content.vulnerabilityInformation,
          impact: content.impact,
        }}
        onApply={(template) => {
          update({
            title: template.title,
            vulnerabilityInformation: template.vulnerabilityInformation,
            impact: template.impact,
          });
        }}
      />
      <DraftsDialog
        open={dialog === "drafts"}
        onOpenChange={(open) => {
          setDialog(open ? "drafts" : null);
        }}
        currentId={draft.id}
        onOpen={(id) => void navigate({ to: "/compose", search: { draft: id } })}
        onDeletedCurrent={() => void navigate({ to: "/compose", search: {} })}
      />
      <SubmitDialog
        open={dialog === "submit"}
        onOpenChange={(open) => {
          setDialog(open ? "submit" : null);
        }}
        plan={plan}
        onSubmitted={(reportId) => void onSubmitted(reportId)}
      />
    </>
  );
}
