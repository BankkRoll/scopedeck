/**
 * The report composer: a guided flow from target to submission.
 *
 * Responsibilities:
 * - Keep one draft per editor session and autosave it.
 * - Show a step rail with per-field status and a draft quality score.
 * - Offer weakness templates and a CVSS calculator that writes its vector into the report.
 * - Hand the finished draft to the submit dialog, choosing between direct and intent submission.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Calculator, Check, Sparkles, Circle, CircleAlert, FileText, Paperclip, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import type { SeverityRating } from "@/ipc/common";
import { describeError, toAppError } from "@/ipc/errors";
import { draftAttachmentRemove, draftAttachmentsPick, draftDelete } from "@/ipc/workspace";
import { CvssCalculator } from "@/components/cvss-calculator";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ErrorNotice, PageHeader } from "@/components/status";
import { Kbd } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgramAvatar } from "@/components/program-avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TITLE_LIMIT,
  canSubmit,
  submissionPath,
  toNewReport,
  validateDraft,
  type ComposerField,
  type ComposerProblem,
} from "@/domain/composer-validation";
import { baseScore, parseVector } from "@/domain/cvss";
import { extractCvssVector, upsertCvssSection } from "@/domain/cvss-section";
import type { AssistantProgramContext } from "@/domain/ai-prompts";
import { draftQuality, type DraftQuality } from "@/domain/draft-quality";
import { assetTypeLabel, formatBytes, formatRelative, humanize } from "@/domain/format";
import { intentDescription } from "@/domain/intent-description";
import { templateForWeakness } from "@/domain/report-templates";
import { groupByAssetType, submittableScopes } from "@/domain/scope-eligibility";
import { cn } from "@/lib/cn";
import { MOD_LABEL } from "@/features/shell/shortcuts";
import { usePrograms, useProgram } from "@/features/programs/use-programs";
import { queryKeys } from "@/query/keys";
import { AssistantSheet } from "./assistant-sheet";
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

type BodyTab = "vulnerability" | "impact";

interface Step {
  id: string;
  label: string;
  group: "Target" | "Write" | "Finish";
  done: boolean;
  /** Element id to scroll to and focus. */
  focus: string;
  field?: ComposerField;
  optional?: boolean;
  tab?: BodyTab;
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state.kind === "saving") return <span>Saving</span>;
  if (state.kind === "saved") return <span>Saved {formatRelative(state.at)}</span>;
  if (state.kind === "failed") return <span className="text-danger">{describeError(state.error).title}</span>;
  return <span>Drafts save as you type</span>;
}

function SectionHeading({
  id,
  title,
  detail,
  action,
}: {
  id: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
      <div>
        <h2 id={id} className="text-[14px] font-semibold text-ink">
          {title}
        </h2>
        <p className="text-[13px] text-faint">{detail}</p>
      </div>
      {action}
    </div>
  );
}

function StepRail({
  steps,
  problems,
  onSelect,
}: {
  steps: Step[];
  problems: readonly ComposerProblem[];
  onSelect: (step: Step) => void;
}) {
  const groups = ["Target", "Write", "Finish"] as const;
  return (
    <nav aria-label="Report steps" className="flex flex-col gap-4 p-4">
      {groups.map((group) => (
        <div key={group} className="flex flex-col gap-0.5">
          <h3 className="mb-1 px-2 text-[11px] font-medium tracking-wide text-faint uppercase">{group}</h3>
          {steps
            .filter((step) => step.group === group)
            .map((step) => {
              const failing = problems.some((problem) => problem.field === step.field && problem.blocking);
              const Icon = failing ? CircleAlert : step.done ? Check : Circle;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    onSelect(step);
                  }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-3.5 shrink-0",
                      failing ? "text-danger" : step.done ? "text-accent" : "text-faint",
                    )}
                  />
                  <span className={cn("min-w-0 flex-1 truncate", step.done && "text-ink")}>{step.label}</span>
                  {step.optional ? <span className="text-[11px] text-faint">Optional</span> : null}
                  <span className="sr-only">
                    {failing ? "needs attention" : step.done ? "done" : "to do"}
                  </span>
                </button>
              );
            })}
        </div>
      ))}
    </nav>
  );
}

function QualityPanel({ quality }: { quality: DraftQuality }) {
  const failing = quality.checks.filter((check) => !check.passed);
  return (
    <section aria-label="Draft quality" className="mt-auto flex flex-col gap-2.5 border-t border-line p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-medium text-muted">Draft quality</h3>
        <span className="font-mono text-[13px] text-ink tabular-nums">{quality.score}/100</span>
      </div>
      <div
        role="meter"
        aria-label="Draft quality"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={quality.score}
        className="h-1 overflow-hidden rounded-full bg-raised"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${quality.score}%` }}
        />
      </div>
      {failing.length === 0 ? (
        <p className="text-[13px] text-faint">Every check passes.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {failing.map((check) => (
            <li key={check.id} className="text-[12px] leading-snug">
              <span className="text-ink">{check.label}</span>
              <span className="block text-faint">{check.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
  const [seenDraft, setSeenDraft] = useState<string | undefined>(search.draft);
  const [createdId, setCreatedId] = useState<string | undefined>(undefined);
  if (search.draft !== seenDraft) {
    setSeenDraft(search.draft);
    if (search.draft === undefined || search.draft !== createdId) {
      setSession((current) => ({ key: current.key + 1, draftId: search.draft, program: search.program }));
    }
  }
  return (
    <Composer
      key={session.key}
      draftId={session.draftId}
      initialProgram={session.program}
      onCreated={(id) => {
        // NOTE: The router store updates synchronously, so the id must be committed before the URL
        // changes; otherwise the new `draft` param looks foreign and remounts the editor.
        flushSync(() => {
          setCreatedId(id);
        });
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
  const [tab, setTab] = useState<BodyTab>("vulnerability");
  const [cvssOpen, setCvssOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const ids = {
    program: useId(),
    asset: useId(),
    weakness: useId(),
    severity: useId(),
    title: useId(),
    body: useId(),
    exclusions: useId(),
    files: useId(),
    target: useId(),
    write: useId(),
    finish: useId(),
  };

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

  const weakness = detail?.weaknesses.find((candidate) => candidate.id === content.weaknessId) ?? null;
  const quality = useMemo(
    () => draftQuality(content, { weaknessName: weakness?.name }),
    [content, weakness?.name],
  );
  const cvssVector = useMemo(
    () => extractCvssVector(content.vulnerabilityInformation),
    [content.vulnerabilityInformation],
  );
  const cvssScore = useMemo(() => {
    const metrics = cvssVector ? parseVector(cvssVector) : null;
    return metrics ? baseScore(metrics) : null;
  }, [cvssVector]);
  const template = weakness ? templateForWeakness(weakness) : null;
  const selectedScope = detail?.scopes.find((scope) => scope.id === content.structuredScopeId);
  const capIndex = SEVERITIES.findIndex((rating) => rating === selectedScope?.maxSeverity?.toLowerCase());
  const severityCap =
    selectedScope?.maxSeverity &&
    content.severityRating &&
    capIndex >= 0 &&
    SEVERITIES.indexOf(content.severityRating) > capIndex
      ? { asset: selectedScope.assetIdentifier, max: selectedScope.maxSeverity }
      : null;
  const bodyEmpty = !content.vulnerabilityInformation.trim() || !content.impact.trim();
  const hasExclusions = Boolean(detail && detail.exclusions.length > 0);

  const steps: Step[] = [
    {
      id: "program",
      label: "Program",
      group: "Target",
      done: Boolean(content.programHandle),
      field: "programHandle",
      focus: ids.program,
    },
    {
      id: "asset",
      label: "Asset",
      group: "Target",
      done: Boolean(content.structuredScopeId),
      field: "structuredScopeId",
      focus: ids.asset,
    },
    {
      id: "weakness",
      label: "Weakness",
      group: "Target",
      done: Boolean(content.weaknessId),
      field: "weaknessId",
      focus: ids.weakness,
    },
    {
      id: "severity",
      label: "Severity",
      group: "Target",
      done: content.severityRating !== null,
      field: "severityRating",
      focus: ids.severity,
    },
    {
      id: "title",
      label: "Title",
      group: "Write",
      done: Boolean(content.title.trim()),
      field: "title",
      focus: ids.title,
    },
    {
      id: "details",
      label: "Vulnerability information",
      group: "Write",
      done: Boolean(content.vulnerabilityInformation.trim()),
      field: "vulnerabilityInformation",
      focus: ids.body,
      tab: "vulnerability",
    },
    {
      id: "impact",
      label: "Impact",
      group: "Write",
      done: Boolean(content.impact.trim()),
      field: "impact",
      focus: ids.body,
      tab: "impact",
    },
    ...(detail && hasExclusions
      ? [
          {
            id: "exclusions",
            label: "Exclusions",
            group: "Finish",
            done: detail.exclusions.every((exclusion) =>
              content.acknowledgedExclusions.includes(exclusion.id),
            ),
            field: "acknowledgedExclusions",
            focus: ids.exclusions,
          } satisfies Step,
        ]
      : []),
    {
      id: "files",
      label: "Attachments",
      group: "Finish",
      done: draft.attachments.length > 0,
      optional: true,
      focus: ids.files,
    },
  ];

  const assistantProgram = useMemo<AssistantProgramContext | null>(() => {
    const row = detail?.program;
    if (!detail || !row) return null;
    return {
      name: row.name,
      handle: row.handle,
      policy: row.policy,
      asset: detail.scopes.find((scope) => scope.id === content.structuredScopeId)?.assetIdentifier ?? null,
      weakness: weakness?.name ?? null,
      exclusions: detail.exclusions,
    };
  }, [detail, content.structuredScopeId, weakness?.name]);

  const goTo = (step: Step) => {
    if (step.tab) setTab(step.tab);
    const target = document.getElementById(step.focus);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target instanceof HTMLButtonElement || target instanceof HTMLInputElement) {
      target.focus({ preventScroll: true });
    }
  };

  const applyTemplate = () => {
    if (!template) return;
    update({
      vulnerabilityInformation: content.vulnerabilityInformation.trim()
        ? content.vulnerabilityInformation
        : template.vulnerabilityInformation,
      impact: content.impact.trim() ? content.impact : template.impact,
    });
    toast(`Started from the ${template.label} template`);
  };

  return (
    <>
      <PageHeader
        title={content.title.trim() || "New report"}
        meta={<SaveIndicator state={draft.saveState} />}
        actions={
          <>
            <Button
              onClick={() => {
                setAssistantOpen(true);
              }}
            >
              <Sparkles />
              Assistant
            </Button>
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
      <div className="grid min-h-0 flex-1 grid-cols-[232px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-line" aria-label="Progress">
          <StepRail steps={steps} problems={attempted ? problems : []} onSelect={goTo} />
          <QualityPanel quality={quality} />
        </aside>

        <div className="min-h-0 overflow-y-auto">
          <div className="mx-auto flex max-w-[960px] flex-col gap-7 px-6 py-5">
            <section aria-labelledby={ids.target} className="flex flex-col gap-4">
              <SectionHeading
                id={ids.target}
                title="Target"
                detail="Where the issue is and what kind it is"
              />
              <div className="grid grid-cols-3 gap-3">
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
                  hint={detail ? `${submittableScopes(detail.scopes).length} accept submissions` : undefined}
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
              </div>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1.5 text-[13px] font-medium text-muted">Severity</legend>
                <div className="flex items-center gap-3">
                  <div role="radiogroup" aria-label="Severity" className="grid flex-1 grid-cols-5 gap-1">
                    {SEVERITIES.map((rating, index) => (
                      <button
                        key={rating}
                        id={index === 0 ? ids.severity : undefined}
                        type="button"
                        role="radio"
                        aria-checked={content.severityRating === rating}
                        onClick={() => {
                          update({ severityRating: content.severityRating === rating ? null : rating });
                        }}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line px-1 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink aria-checked:border-line-strong aria-checked:bg-raised aria-checked:text-ink"
                      >
                        <span
                          className={cn("size-1.5 shrink-0 rounded-full", SEVERITY_DOT[rating])}
                          aria-hidden
                        />
                        {humanize(rating)}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={() => {
                      setCvssOpen(true);
                    }}
                  >
                    <Calculator />
                    {cvssScore === null ? "CVSS calculator" : `CVSS ${cvssScore.toFixed(1)}`}
                  </Button>
                </div>
                {problemFor("severityRating") ? (
                  <p className="text-[13px] text-warning">{problemFor("severityRating")}</p>
                ) : null}
                {severityCap ? (
                  <p className="text-[13px] text-warning">
                    The program caps {severityCap.asset} at {humanize(severityCap.max)} severity.
                  </p>
                ) : null}
              </fieldset>
            </section>

            <section aria-labelledby={ids.write} className="flex flex-col gap-3">
              <SectionHeading
                id={ids.write}
                title="Write"
                detail="A specific title, reproducible steps and a concrete impact"
                action={
                  template && bodyEmpty ? (
                    <Button size="sm" onClick={applyTemplate}>
                      <FileText />
                      Start from {template.label} template
                    </Button>
                  ) : null
                }
              />
              <div>
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
                  placeholder="Report title: what is broken, where, and what it allows"
                  aria-invalid={Boolean(problemFor("title"))}
                  className="h-10 w-full rounded-md border border-line bg-surface px-3 text-[15px] font-medium text-ink transition-colors placeholder:font-normal placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none aria-invalid:border-danger/70"
                />
                <div className="mt-1 flex justify-between gap-3 text-[12px]">
                  <span className="text-danger">{problemFor("title")}</span>
                  <span
                    className={cn(
                      "font-mono text-faint tabular-nums",
                      content.title.length > TITLE_LIMIT && "text-danger",
                    )}
                  >
                    {content.title.length}/{TITLE_LIMIT}
                  </span>
                </div>
              </div>
              <Tabs
                id={ids.body}
                value={tab}
                onValueChange={(value) => {
                  setTab(value === "impact" ? "impact" : "vulnerability");
                }}
                className="flex h-[520px] flex-col overflow-hidden rounded-md border border-line bg-surface"
              >
                <TabsList className="px-3">
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

            <section aria-labelledby={ids.finish} className="flex flex-col gap-4 pb-6">
              <SectionHeading
                id={ids.finish}
                title="Finish"
                detail="Confirm the policy and attach evidence"
              />
              <div className={cn("grid gap-6", hasExclusions && "grid-cols-2")}>
                {detail && hasExclusions ? (
                  <fieldset id={ids.exclusions} className="flex flex-col gap-2.5">
                    <legend className="mb-1.5 text-[13px] font-medium text-muted">
                      Not in an excluded category
                    </legend>
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

                <section id={ids.files} aria-label="Attachments" className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[13px] font-medium text-muted">Attachments</h3>
                    <Button size="sm" onClick={() => void pickAttachments()}>
                      <Paperclip />
                      Add files
                    </Button>
                  </div>
                  {draft.attachments.length > 0 ? (
                    <ul className="divide-y divide-line rounded-md border border-line">
                      {draft.attachments.map((attachment) => (
                        <li key={attachment.id} className="flex items-center gap-2 px-2.5 py-1.5">
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
                  ) : (
                    <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[13px] text-faint">
                      No files yet
                    </p>
                  )}
                  <p className="text-[13px] text-faint">
                    {draft.attachments.length === 0
                      ? "Reports with attachments are sent through a report intent."
                      : path === "intent"
                        ? "This report will go through a report intent so the files upload with it."
                        : "This program does not accept report intents, so files must be added on HackerOne after submitting."}
                  </p>
                  {attachmentError ? <p className="text-[13px] text-danger">{attachmentError}</p> : null}
                </section>
              </div>
              {attempted && blocking.length > 0 ? (
                <p className="text-[13px] text-danger" role="status">
                  {blocking.length === 1
                    ? "1 field needs attention"
                    : `${blocking.length} fields need attention`}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>

      <Sheet
        open={cvssOpen}
        onOpenChange={setCvssOpen}
        title="CVSS 3.1 calculator"
        description="Sets the severity and records the vector in the report"
      >
        <div className="p-5">
          <CvssCalculator
            value={cvssVector}
            onChange={(vector, _score, severityRating) => {
              update({
                severityRating,
                vulnerabilityInformation: upsertCvssSection(content.vulnerabilityInformation, vector),
              });
            }}
          />
        </div>
      </Sheet>
      <AssistantSheet
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        content={content}
        program={assistantProgram}
        onApply={(patch) => {
          update(patch);
          toast("Applied from the assistant");
        }}
      />

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
