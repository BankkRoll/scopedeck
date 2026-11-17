import { z } from "zod";
import { call } from "./invoke";
import { cached, voidSchema } from "./common";

export const programSchema = z.object({
  id: z.string(),
  handle: z.string(),
  name: z.string(),
  currency: z.string().nullable(),
  policy: z.string().nullable(),
  profilePicture: z.string().nullable(),
  submissionState: z.string().nullable(),
  state: z.string().nullable(),
  triageActive: z.boolean().nullable(),
  startedAcceptingAt: z.string().nullable(),
  numberOfReportsForUser: z.number().nullable(),
  numberOfValidReportsForUser: z.number().nullable(),
  bountyEarnedForUser: z.number().nullable(),
  lastInvitationAcceptedAtForUser: z.string().nullable(),
  bookmarked: z.boolean().nullable(),
  allowsBountySplitting: z.boolean().nullable(),
  offersBounties: z.boolean().nullable(),
  openScope: z.boolean().nullable(),
  fastPayments: z.boolean().nullable(),
  goldStandardSafeHarbor: z.boolean().nullable(),
});
export type Program = z.infer<typeof programSchema>;

const programRowSchema = programSchema.extend({ pinned: z.boolean() });
export type ProgramRow = z.infer<typeof programRowSchema>;

export const structuredScopeSchema = z.object({
  id: z.string(),
  assetIdentifier: z.string(),
  assetType: z.string(),
  eligibleForBounty: z.boolean(),
  eligibleForSubmission: z.boolean(),
  instruction: z.string().nullable(),
  maxSeverity: z.string().nullable(),
  confidentialityRequirement: z.string().nullable(),
  integrityRequirement: z.string().nullable(),
  availabilityRequirement: z.string().nullable(),
  reference: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type StructuredScope = z.infer<typeof structuredScopeSchema>;

const scopeRowSchema = structuredScopeSchema.extend({ changedSinceLastSync: z.boolean() });
export type ScopeRow = z.infer<typeof scopeRowSchema>;

export const scopeExclusionSchema = z.object({
  id: z.string(),
  category: z.string().nullable(),
  details: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type ScopeExclusion = z.infer<typeof scopeExclusionSchema>;

export const weaknessSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  externalId: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Weakness = z.infer<typeof weaknessSchema>;

const intentSupportSchema = z.enum(["unknown", "supported", "unsupported"]);
export type IntentSupport = z.infer<typeof intentSupportSchema>;

const programDetailSchema = z.object({
  program: programRowSchema.nullable(),
  scopes: z.array(scopeRowSchema),
  exclusions: z.array(scopeExclusionSchema),
  weaknesses: z.array(weaknessSchema),
  reportIntents: intentSupportSchema,
});
export type ProgramDetail = z.infer<typeof programDetailSchema>;

const searchKindSchema = z.enum(["program", "scope", "hacktivity"]);
export type SearchKind = z.infer<typeof searchKindSchema>;

const searchHitSchema = z.object({
  kind: searchKindSchema,
  reference: z.string(),
  program: z.string().nullable(),
  title: z.string(),
  detail: z.string(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

const programsSchema = cached(z.array(programRowSchema));
const detailSchema = cached(programDetailSchema);

export const programsCached = () => call("programs_cached", programsSchema);
export const programsSync = () => call("programs_sync", programsSchema);
export const programCached = (handle: string) => call("program_cached", detailSchema, { handle });
export const programSync = (handle: string) => call("program_sync", detailSchema, { handle });
export const programSetPinned = (handle: string, pinned: boolean) =>
  call("program_set_pinned", voidSchema, { handle, pinned });
export const localSearch = (query: string, kinds: SearchKind[], limit?: number) =>
  call("local_search", z.array(searchHitSchema), { query, kinds, limit: limit ?? null });
