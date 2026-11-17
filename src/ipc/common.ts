import { z } from "zod";

export function cached<T extends z.ZodType>(data: T) {
  return z.object({ data, syncedAt: z.string().nullable() });
}

export interface Cached<T> {
  data: T;
  syncedAt: string | null;
}

export const attachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  contentType: z.string().nullable(),
  fileSize: z.number().nullable(),
  expiringUrl: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const severityRatingSchema = z.enum(["none", "low", "medium", "high", "critical"]);
export type SeverityRating = z.infer<typeof severityRatingSchema>;

export const voidSchema = z.null();
