import { z } from "zod";
import { call } from "./invoke";
import { attachmentSchema } from "./common";

const intentPhaseSchema = z.enum(["analyzing", "needsInput", "ready", "submitted", "failed"]);
export type IntentPhase = z.infer<typeof intentPhaseSchema>;

export const reportIntentSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  description: z.string(),
  state: z.enum(["pending", "draft", "ready_to_submit", "submitted", "unknown"]),
  phase: intentPhaseSchema,
  hasFailingJobs: z.boolean(),
  hasCanceledJobs: z.boolean(),
  jobStatusByType: z.record(z.string(), z.string()),
  metadata: z.object({
    bugClass: z.string().nullable(),
    httpMethod: z.string().nullable(),
    vulnerableUrl: z.string().nullable(),
    vulnerableParameter: z.string().nullable(),
  }),
  programId: z.string().nullable(),
  reportId: z.string().nullable(),
  attachments: z.array(attachmentSchema),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type ReportIntent = z.infer<typeof reportIntentSchema>;

const attachmentsSchema = z.array(attachmentSchema);

export const INTENT_UPDATED_EVENT = "report-intent-updated";

export const intentsList = () => call("intents_list", z.array(reportIntentSchema));
export const intentGet = (id: string) => call("intent_get", reportIntentSchema, { id });
export const intentCreate = (draftId: string, teamHandle: string, description: string) =>
  call("intent_create", reportIntentSchema, { draftId, teamHandle, description });
export const intentUpdate = (id: string, description: string) =>
  call("intent_update", reportIntentSchema, { id, description });
export const intentDelete = (id: string) => call("intent_delete", reportIntentSchema, { id });
export const intentSubmit = (id: string) => call("intent_submit", reportIntentSchema, { id });
export const intentWatch = (id: string) => call("intent_watch", reportIntentSchema, { id });
export const intentAttachments = (id: string) => call("intent_attachments", attachmentsSchema, { id });
export const intentAttachmentsAdd = (id: string) => call("intent_attachments_add", attachmentsSchema, { id });
export const intentAttachmentDelete = (id: string, attachmentId: string) =>
  call("intent_attachment_delete", attachmentsSchema, { id, attachmentId });
