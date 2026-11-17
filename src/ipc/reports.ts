import { z } from "zod";
import { call } from "./invoke";
import { attachmentSchema, cached, type SeverityRating } from "./common";
import { structuredScopeSchema, weaknessSchema } from "./programs";

const severitySchema = z.object({
  id: z.string(),
  rating: z.string().nullable(),
  authorType: z.string().nullable(),
  score: z.number().nullable(),
  attackVector: z.string().nullable(),
  attackComplexity: z.string().nullable(),
  privilegesRequired: z.string().nullable(),
  userInteraction: z.string().nullable(),
  scope: z.string().nullable(),
  confidentiality: z.string().nullable(),
  integrity: z.string().nullable(),
  availability: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Severity = z.infer<typeof severitySchema>;

const activitySchema = z.object({
  id: z.string(),
  kind: z.string(),
  message: z.string().nullable(),
  internal: z.boolean(),
  createdAt: z.string().nullable(),
  actor: z
    .object({
      kind: z.string(),
      username: z.string().nullable(),
      name: z.string().nullable(),
      handle: z.string().nullable(),
    })
    .nullable(),
  attachments: z.array(attachmentSchema),
});
export type Activity = z.infer<typeof activitySchema>;

const bountySchema = z.object({
  id: z.string(),
  amount: z.string().nullable(),
  bonusAmount: z.string().nullable(),
  awardedAmount: z.string().nullable(),
  awardedBonusAmount: z.string().nullable(),
  awardedCurrency: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Bounty = z.infer<typeof bountySchema>;

export const reportSchema = z.object({
  id: z.string(),
  title: z.string(),
  vulnerabilityInformation: z.string().nullable(),
  state: z.string().nullable(),
  createdAt: z.string().nullable(),
  submittedAt: z.string().nullable(),
  triagedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  lastReporterActivityAt: z.string().nullable(),
  firstProgramActivityAt: z.string().nullable(),
  lastProgramActivityAt: z.string().nullable(),
  bountyAwardedAt: z.string().nullable(),
  disclosedAt: z.string().nullable(),
  cveIds: z.array(z.string()),
  program: z.object({ id: z.string(), handle: z.string() }).nullable(),
  weakness: weaknessSchema.nullable(),
  severity: severitySchema.nullable(),
  structuredScope: structuredScopeSchema.nullable(),
  activities: z.array(activitySchema),
  attachments: z.array(attachmentSchema),
  bounties: z.array(bountySchema),
  summaries: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      category: z.string().nullable(),
      createdAt: z.string().nullable(),
    }),
  ),
});
export type Report = z.infer<typeof reportSchema>;

export interface NewReport {
  teamHandle: string;
  title: string;
  vulnerabilityInformation: string;
  impact: string;
  severityRating: SeverityRating | null;
  weaknessId: string | null;
  structuredScopeId: string | null;
}

export const reportChangeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stateChanged"),
    id: z.string(),
    title: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  z.object({ kind: z.literal("newActivity"), id: z.string(), title: z.string() }),
]);

const reportsSchema = cached(z.array(reportSchema));

export const reportsCached = () => call("reports_cached", reportsSchema);
export const reportsSync = () => call("reports_sync", reportsSchema);
export const reportCached = (id: string) => call("report_cached", reportSchema.nullable(), { id });
export const reportSync = (id: string) => call("report_sync", reportSchema, { id });
export const reportPreview = (input: NewReport) => call("report_preview", z.json(), { input });
export const reportSubmit = (input: NewReport) => call("report_submit", reportSchema, { input });
