import { invoke } from "@tauri-apps/api/core";
import type { z } from "zod";
import { CommandFailure, parseCommandError } from "./errors";

export async function call<S extends z.ZodType>(
  command: string,
  schema: S,
  args?: Record<string, unknown>,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await invoke(command, args);
  } catch (error) {
    throw new CommandFailure(parseCommandError(error));
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new CommandFailure({
      kind: "contract",
      command,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    });
  }
  return parsed.data;
}
