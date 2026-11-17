import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toAppError } from "@/ipc/errors";
import { intentCreate } from "@/ipc/intents";
import { reportPreview, reportSubmit, type NewReport } from "@/ipc/reports";
import type { DraftAttachment } from "@/ipc/workspace";
import { ErrorNotice } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { formatBytes } from "@/domain/format";
import { IntentTracker } from "@/features/intents/intent-tracker";
import { queryKeys } from "@/query/keys";

type SubmitPlan =
  | { path: "direct"; report: NewReport }
  | {
      path: "intent";
      draftId: string;
      teamHandle: string;
      description: string;
      attachments: DraftAttachment[];
      intentId: string | null;
    };

interface SubmitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: SubmitPlan | null;
  onSubmitted: (reportId: string | null) => void;
}

function Confirm({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="mr-auto flex items-center gap-2 text-[13px] text-muted">
      <Checkbox checked={checked} onCheckedChange={onChange} />I reviewed exactly what will be sent.
      Submitting cannot be undone.
    </label>
  );
}

function DirectSubmit({
  report,
  onSubmitted,
  onCancel,
}: {
  report: NewReport;
  onSubmitted: (id: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const preview = useQuery({
    queryKey: ["report-preview", report],
    queryFn: () => reportPreview(report),
    staleTime: 0,
  });
  const submit = useMutation({
    mutationFn: () => reportSubmit(report),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.reports.cached });
      onSubmitted(created.id);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        This JSON body goes to <span className="font-mono text-ink">POST /v1/hackers/reports</span>.
        Attachments cannot be added through this endpoint; add them on HackerOne after submitting.
      </p>
      {preview.isError ? <ErrorNotice error={toAppError(preview.error)} /> : null}
      {preview.data ? (
        <pre className="selectable max-h-[46vh] overflow-auto rounded-md border border-line bg-raised p-3 font-mono text-[13px] leading-5 whitespace-pre-wrap">
          {JSON.stringify(preview.data, null, 2)}
        </pre>
      ) : null}
      {submit.isError ? <ErrorNotice error={toAppError(submit.error)} /> : null}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Confirm checked={confirmed} onChange={setConfirmed} />
        <Button onClick={onCancel}>Back to editing</Button>
        <Button
          variant="primary"
          disabled={!confirmed || !preview.data || submit.isPending}
          onClick={() => {
            submit.mutate();
          }}
        >
          {submit.isPending ? "Submitting" : "Submit report"}
        </Button>
      </div>
    </div>
  );
}

function IntentSubmit({
  plan,
  onSubmitted,
  onCancel,
}: {
  plan: Extract<SubmitPlan, { path: "intent" }>;
  onSubmitted: (reportId: string | null) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [intentId, setIntentId] = useState<string | null>(plan.intentId);
  const [confirmed, setConfirmed] = useState(false);
  const create = useMutation({
    mutationFn: () => intentCreate(plan.draftId, plan.teamHandle, plan.description),
    onSuccess: (intent) => {
      queryClient.setQueryData(queryKeys.intent(intent.id), intent);
      void queryClient.invalidateQueries({ queryKey: queryKeys.draft(plan.draftId) });
      setIntentId(intent.id);
    },
  });

  if (intentId) {
    return (
      <IntentTracker
        intentId={intentId}
        onSubmitted={onSubmitted}
        onDeleted={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.draft(plan.draftId) });
          setIntentId(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        Drafts with attachments go through a report intent: the description and files are sent to HackerOne's
        Report Assistant, which analyzes them before you submit. Creating the intent does not submit a report
        yet.
      </p>
      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 text-[13px]">
        <dt className="text-faint">Program</dt>
        <dd className="font-mono">{plan.teamHandle}</dd>
        <dt className="text-faint">Attachments</dt>
        <dd>
          {plan.attachments.map((attachment) => (
            <p key={attachment.id}>
              {attachment.fileName} <span className="text-faint">{formatBytes(attachment.size)}</span>
            </p>
          ))}
        </dd>
      </dl>
      <pre className="selectable max-h-[40vh] overflow-auto rounded-md border border-line bg-raised p-3 font-mono text-[13px] leading-5 whitespace-pre-wrap">
        {plan.description}
      </pre>
      {create.isError ? <ErrorNotice error={toAppError(create.error)} /> : null}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <Confirm checked={confirmed} onChange={setConfirmed} />
        <Button onClick={onCancel}>Back to editing</Button>
        <Button
          variant="primary"
          disabled={!confirmed || create.isPending}
          onClick={() => {
            create.mutate();
          }}
        >
          {create.isPending ? "Uploading" : "Create intent and upload"}
        </Button>
      </div>
    </div>
  );
}

export function SubmitDialog({ open, onOpenChange, plan, onSubmitted }: SubmitDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={plan?.path === "intent" ? "Submit through a report intent" : "Review and submit"}
      className="w-[min(760px,calc(100vw-32px))]"
    >
      {plan?.path === "direct" ? (
        <DirectSubmit
          report={plan.report}
          onSubmitted={onSubmitted}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      ) : null}
      {plan?.path === "intent" ? (
        <IntentSubmit
          plan={plan}
          onSubmitted={onSubmitted}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

export type { SubmitPlan };
