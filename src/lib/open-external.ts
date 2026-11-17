import { toast } from "sonner";
import { describeError, toAppError } from "@/ipc/errors";
import { openExternal } from "@/ipc/system";

export async function openOnHackerOne(url: string): Promise<void> {
  try {
    await openExternal(url);
  } catch (error) {
    const description = describeError(toAppError(error));
    toast.error(description.title, { description: description.detail });
  }
}
