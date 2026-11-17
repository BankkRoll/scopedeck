import { z } from "zod";

/**
 * How a data page lays out its rows. Only the reports page offers `board`; the others keep
 * showing just cards and list, so values persisted before `board` existed still parse.
 */
export const viewModeSchema = z.enum(["list", "cards", "board"]);
/** How a data page lays out its rows. */
export type ViewMode = z.infer<typeof viewModeSchema>;

/** A sort key plus direction, as stored per page. */
export const sortStateSchema = z.object({ id: z.string(), desc: z.boolean() });
/** A sort key plus direction, as stored per page. */
export type SortState = z.infer<typeof sortStateSchema>;
