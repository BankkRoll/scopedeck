import { z } from "zod";
import { call } from "./invoke";
import { voidSchema } from "./common";

export const openExternal = (url: string) => call("open_external", voidSchema, { url });
export const saveTextFile = (
  defaultName: string,
  extension: "csv" | "json" | "txt" | "md",
  contents: string,
) => call("save_text_file", z.boolean(), { defaultName, extension, contents });
export const notificationsEnable = () => call("notifications_enable", z.boolean());

const updateInfoSchema = z.object({ version: z.string(), notes: z.string().nullable() }).nullable();
export type UpdateInfo = z.infer<typeof updateInfoSchema>;

export const updateCheck = () => call("update_check", updateInfoSchema);
export const updateInstall = () => call("update_install", voidSchema);

export const REPORTS_UPDATED_EVENT = "reports-updated";
export const SYNC_FAILED_EVENT = "background-sync-failed";
