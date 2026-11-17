import { z } from "zod";
import { call } from "./invoke";
import { severityRatingSchema, voidSchema } from "./common";

export const draftContentSchema = z.object({
  programHandle: z.string().nullable(),
  title: z.string(),
  structuredScopeId: z.string().nullable(),
  weaknessId: z.string().nullable(),
  severityRating: severityRatingSchema.nullable(),
  vulnerabilityInformation: z.string(),
  impact: z.string(),
  acknowledgedExclusions: z.array(z.string()),
});
export type DraftContent = z.infer<typeof draftContentSchema>;

const draftAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  size: z.number(),
  contentType: z.string(),
});
export type DraftAttachment = z.infer<typeof draftAttachmentSchema>;

const draftSchema = draftContentSchema.extend({
  id: z.string(),
  attachments: z.array(draftAttachmentSchema),
  intentId: z.string().nullable(),
  updatedAt: z.string(),
});
export type Draft = z.infer<typeof draftSchema>;

const templateContentSchema = z.object({
  name: z.string(),
  title: z.string(),
  vulnerabilityInformation: z.string(),
  impact: z.string(),
});
export type TemplateContent = z.infer<typeof templateContentSchema>;

const templateSchema = templateContentSchema.extend({ id: z.string(), updatedAt: z.string() });
export type Template = z.infer<typeof templateSchema>;

const savedSearchSchema = z.object({
  id: z.string(),
  name: z.string(),
  builder: z.unknown(),
  createdAt: z.string(),
});
export type SavedSearch = z.infer<typeof savedSearchSchema>;

const settingsSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
  syncIntervalMinutes: z.number(),
  notifications: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const draftsList = () => call("drafts_list", z.array(draftSchema));
export const draftGet = (id: string) => call("draft_get", draftSchema, { id });
export const draftSave = (id: string | null, content: DraftContent) =>
  call("draft_save", draftSchema, { id, content });
export const draftDelete = (id: string) => call("draft_delete", voidSchema, { id });
export const draftAttachmentsPick = (draftId: string) =>
  call("draft_attachments_pick", draftSchema, { draftId });
export const draftAttachmentRemove = (draftId: string, attachmentId: string) =>
  call("draft_attachment_remove", draftSchema, { draftId, attachmentId });

export const templatesList = () => call("templates_list", z.array(templateSchema));
export const templateSave = (id: string | null, content: TemplateContent) =>
  call("template_save", templateSchema, { id, content });
export const templateDelete = (id: string) => call("template_delete", voidSchema, { id });

export const savedSearchesList = () => call("saved_searches_list", z.array(savedSearchSchema));
export const savedSearchSave = (name: string, builder: unknown) =>
  call("saved_search_save", savedSearchSchema, { name, builder });
export const savedSearchDelete = (id: string) => call("saved_search_delete", voidSchema, { id });

export const settingsGet = () => call("settings_get", settingsSchema);
export const settingsSave = (settings: Settings) => call("settings_save", settingsSchema, { settings });
export const cacheClear = () => call("cache_clear", voidSchema);
