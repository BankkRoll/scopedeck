import { z } from "zod";
import { call } from "./invoke";
import { cached } from "./common";

const earningSchema = z.object({
  id: z.string(),
  kind: z.enum(["bounty", "retest", "pentest", "other"]),
  amount: z.number(),
  createdAt: z.string().nullable(),
  programHandle: z.string().nullable(),
  programName: z.string().nullable(),
  reportId: z.string().nullable(),
});
export type Earning = z.infer<typeof earningSchema>;

const payoutSchema = z.object({
  amount: z.number().nullable(),
  paidOutAt: z.string().nullable(),
  reference: z.string().nullable(),
  payoutProvider: z.string().nullable(),
  status: z.string().nullable(),
});
export type Payout = z.infer<typeof payoutSchema>;

const snapshotSchema = cached(
  z.object({
    balance: z.object({ balance: z.number() }).nullable(),
    earnings: z.array(earningSchema),
    payouts: z.array(payoutSchema),
  }),
);
export type EarningsSnapshot = z.infer<typeof snapshotSchema>["data"];

export const earningsCached = () => call("earnings_cached", snapshotSchema);
export const earningsSync = () => call("earnings_sync", snapshotSchema);
