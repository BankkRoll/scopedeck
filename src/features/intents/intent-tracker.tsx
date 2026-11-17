import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { Paperclip, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toAppError } from "@/ipc/errors";
import {
  INTENT_UPDATED_EVENT,
  intentAttachmentDelete,
  intentAttachments,
  intentAttachmentsAdd,
  intentDelete,
  intentGet,
  intentSubmit,
  intentUpdate,
  intentWatch,
  reportIntentSchema,
  type IntentPhase,
  type ReportIntent,
} from "@/ipc/intents";
import { ErrorNotice } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Textarea } from "@/components/ui/field";
import { formatBytes, humanize } from "@/domain/format";
import { cn } from "@/lib/cn";
import { queryKeys } from "@/query/keys";

const STEPS: { phase: IntentPhase; label: string }[] = [
  { phase: "analyzing", label: "Analyzing" },
  { phase: "needsInput", label: "Draft" },
  { phase: "ready", label: "Ready to submit" },
  { phase: "submitted", label: "Submitted" },
];

function stepIndex(phase: IntentPhase): number {
  if (phase === "failed") return 1;
  return STEPS.findIndex((step) => step.phase === phase);
}

function useIntentLiveUpdates(id: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unlisten = listen<unknown>(INTENT_UPDATED_EVENT, (event) => {
      const parsed = reportIntentSchema.safeParse(event.payload);
      if (parsed.success && parsed.data.id === id)
        queryClient.setQueryData(queryKeys.intent(id), parsed.data);
    });
    return () => {
      void unlisten.then((stop) => {
        stop();
      });
    };
  }, [id, queryClient]);
}

interface IntentTrackerProps {
  intentId: string;
  onSubmitted: (reportId: string | null) => void;
  onDeleted: () => void;
}

export function IntentTracker({ intentId, onSubmitted, onDeleted }: IntentTrackerProps) {
  const queryClient = useQueryClient();
  const descriptionId = useId();
  const [description, setDescription] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useIntentLiveUpdates(intentId);

  const intent = useQuery({ queryKey: queryKeys.intent(intentId), queryFn: () => intentGet(intentId) });
  const attachments = useQuery({
    queryKey: [...queryKeys.intent(intentId), "attachments"],
    queryFn: () => intentAttachments(intentId),
  });
  const store = (next: ReportIntent) => queryClient.setQueryData(queryKeys.intent(intentId), next);
  const watch = useMutation({ mutationFn: () => intentWatch(intentId), onSuccess: store });
  const update = useMutation({
    mutationFn: (text: string) => intentUpdate(intentId, text),
    onSuccess: (next) => {
      store(next);
      setDescription(null);
      watch.mutate();
    },
  });
  const addFiles = useMutation({
    mutationFn: () => intentAttachmentsAdd(intentId),
    onSuccess: (next) => queryClient.setQueryData([...queryKeys.intent(intentId), "attachments"], next),
  });
  const removeFile = useMutation({
    mutationFn: (attachmentId: string) => intentAttachmentDelete(intentId, attachmentId),
    onSuccess: (next) => queryClient.setQueryData([...queryKeys.intent(intentId), "attachments"], next),
  });
  const submit = useMutation({
    mutationFn: () => intentSubmit(intentId),
    onSuccess: (next) => {
      store(next);
      void queryClient.invalidateQueries({ queryKey: queryKeys.intents });
      onSubmitted(next.reportId);
    },
  });
  const remove = useMutation({
    mutationFn: () => intentDelete(intentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.intents });
      onDeleted();
    },
  });

  const watchIntent = watch.mutate;
  const phase = intent.data?.phase;
  useEffect(() => {
    if (phase === "analyzing") watchIntent();
  }, [phase, watchIntent]);

  if (intent.isError) return <ErrorNotice error={toAppError(intent.error)} />;
  if (!intent.data) return <p className="text-muted">Loading the report intent</p>;

  const data = intent.data;
  const editable = data.state !== "submitted";
  const current = stepIndex(data.phase);
  const failure = [
    watch.error,
    update.error,
    addFiles.error,
    removeFile.error,
    submit.error,
    remove.error,
  ].find(Boolean);

  return (
    <div className="flex flex-col gap-5">
      <ol className="grid grid-cols-4 gap-2" aria-label="Report intent progress">
        {STEPS.map((step, index) => (
          <li
            key={step.phase}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "border-t-2 pt-2 text-[13px]",
              index < current && "border-ink text-muted",
              index === current &&
                (data.phase === "failed" ? "border-danger text-danger" : "border-accent text-ink"),
              index > current && "border-line text-faint",
            )}
          >
            {index === current && data.phase === "failed" ? "Analysis failed" : step.label}
          </li>
        ))}
      </ol>

      <p className="text-muted">
        {data.phase === "analyzing" &&
          "The Report Assistant is analyzing the description. This page updates on its own."}
        {data.phase === "needsInput" &&
          "The assistant finished. Add detail to the description if it asks for more, or wait for it to become ready."}
        {data.phase === "ready" && "The intent is ready. Review it, then submit to create the report."}
        {data.phase === "submitted" && "Submitted. The report now lives in your inbox."}
        {data.phase === "failed" &&
          "One or more analysis jobs failed. Update the description to retry, or delete the intent."}
      </p>

      {data.title ? (
        <div>
          <p className="text-[13px] text-faint">Generated title</p>
          <p className="mt-0.5 font-medium">{data.title}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
        {Object.entries(data.jobStatusByType).map(([job, status]) => (
          <div key={job} className="flex justify-between gap-3 border-b border-line py-1">
            <dt className="text-muted">{humanize(job)}</dt>
            <dd
              className={cn(
                status === "failed" ? "text-danger" : status === "succeeded" ? "text-ink" : "text-faint",
              )}
            >
              {humanize(status)}
            </dd>
          </div>
        ))}
        {(
          [
            ["Bug class", data.metadata.bugClass],
            ["HTTP method", data.metadata.httpMethod],
            ["Vulnerable URL", data.metadata.vulnerableUrl],
            ["Vulnerable parameter", data.metadata.vulnerableParameter],
          ] as const
        )
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-line py-1">
              <dt className="text-muted">{label}</dt>
              <dd className="selectable truncate font-mono text-ink">{value}</dd>
            </div>
          ))}
      </dl>

      <section aria-label="Attachments">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-faint">Attachments</h3>
          {editable ? (
            <Button
              size="sm"
              onClick={() => {
                addFiles.mutate();
              }}
              disabled={addFiles.isPending}
            >
              <Paperclip />
              {addFiles.isPending ? "Uploading" : "Add files"}
            </Button>
          ) : null}
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {(attachments.data ?? data.attachments).map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate">{attachment.fileName}</span>
              <span className="font-mono text-faint">
                {attachment.fileSize === null ? "" : formatBytes(attachment.fileSize)}
              </span>
              {editable ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${attachment.fileName}`}
                  onClick={() => {
                    removeFile.mutate(attachment.id);
                  }}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
          {(attachments.data ?? data.attachments).length === 0 ? (
            <li className="py-2 text-faint">No attachments</li>
          ) : null}
        </ul>
      </section>

      {editable ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (description !== null) update.mutate(description);
          }}
          className="flex flex-col gap-2"
        >
          <Field label="Description sent to the Report Assistant" htmlFor={descriptionId}>
            <Textarea
              id={descriptionId}
              value={description ?? data.description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              className="min-h-40 font-mono"
            />
          </Field>
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={description === null || description === data.description || update.isPending}
          >
            {update.isPending ? "Updating" : "Update description"}
          </Button>
        </form>
      ) : null}

      {failure ? <ErrorNotice error={toAppError(failure)} /> : null}

      {editable ? (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <Button
            variant="danger"
            onClick={() => {
              remove.mutate();
            }}
            disabled={remove.isPending}
          >
            Delete intent
          </Button>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <Checkbox
                checked={confirmed}
                disabled={data.phase !== "ready"}
                onCheckedChange={setConfirmed}
              />
              I reviewed this. Submitting cannot be undone.
            </label>
            <Button
              variant="primary"
              disabled={data.phase !== "ready" || !confirmed || submit.isPending}
              onClick={() => {
                submit.mutate();
              }}
            >
              {submit.isPending ? "Submitting" : "Submit report"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
