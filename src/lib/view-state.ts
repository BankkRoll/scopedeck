import { z } from "zod";

/** How a data page lays out its rows. */
export const viewModeSchema = z.enum(["list", "cards"]);
/** How a data page lays out its rows. */
export type ViewMode = z.infer<typeof viewModeSchema>;

/** A sort key plus direction, as stored per page. */
export const sortStateSchema = z.object({ id: z.string(), desc: z.boolean() });
/** A sort key plus direction, as stored per page. */
export type SortState = z.infer<typeof sortStateSchema>;
