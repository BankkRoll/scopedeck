import { z } from "zod";
import { call } from "./invoke";

export const hacktivitySortSchema = z.enum([
  "-latest_disclosable_activity_at",
  "latest_disclosable_activity_at",
  "-disclosed_at",
  "disclosed_at",
  "-total_awarded_amount",
  "total_awarded_amount",
  "-votes",
  "votes",
]);
export type HacktivitySort = z.infer<typeof hacktivitySortSchema>;

const hacktivityItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  substate: z.string().nullable(),
  url: z.string().nullable(),
  disclosed: z.boolean(),
  disclosedAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  cveIds: z.array(z.string()),
  cwe: z.string().nullable(),
  severityRating: z.string().nullable(),
  votes: z.number().nullable(),
  totalAwardedAmount: z.number().nullable(),
  latestDisclosableAction: z.string().nullable(),
  latestDisclosableActivityAt: z.string().nullable(),
  summary: z.string().nullable(),
  reporterUsername: z.string().nullable(),
  programHandle: z.string().nullable(),
  programName: z.string().nullable(),
  programUrl: z.string().nullable(),
});
export type HacktivityItem = z.infer<typeof hacktivityItemSchema>;

const cachedPageSchema = z.object({
  page: z.object({
    items: z.array(hacktivityItemSchema),
    pageNumber: z.number(),
    hasNextPage: z.boolean(),
  }),
  fetchedAt: z.string(),
});
export type CachedHacktivityPage = z.infer<typeof cachedPageSchema>;

export interface HacktivityQuery {
  queryString: string;
  sort: HacktivitySort;
  pageNumber: number;
  pageSize: number;
}

export const hacktivityCached = (query: HacktivityQuery) =>
  call("hacktivity_cached", cachedPageSchema.nullable(), { query });
export const hacktivityFetch = (query: HacktivityQuery) =>
  call("hacktivity_fetch", cachedPageSchema, { query });
