import { z } from "zod";

const apiErrorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unauthorized"), detail: z.string().nullable() }),
  z.object({ kind: z.literal("forbidden"), detail: z.string().nullable() }),
  z.object({ kind: z.literal("notFound"), detail: z.string().nullable() }),
  z.object({ kind: z.literal("badRequest"), messages: z.array(z.string()) }),
  z.object({ kind: z.literal("unprocessable"), messages: z.array(z.string()) }),
  z.object({ kind: z.literal("rateLimited"), retryAfterSecs: z.number().nullable() }),
  z.object({ kind: z.literal("server"), status: z.number() }),
  z.object({ kind: z.literal("unexpectedStatus"), status: z.number(), messages: z.array(z.string()) }),
  z.object({ kind: z.literal("network"), message: z.string() }),
  z.object({ kind: z.literal("decode"), message: z.string() }),
  z.object({ kind: z.literal("foreignLink") }),
]);

export type ApiError = z.infer<typeof apiErrorSchema>;

export const commandErrorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("api"), error: apiErrorSchema }),
  z.object({ kind: z.literal("notSignedIn") }),
  z.object({ kind: z.literal("credentials"), message: z.string() }),
  z.object({ kind: z.literal("cache"), message: z.string() }),
  z.object({ kind: z.literal("invalid"), message: z.string() }),
  z.object({ kind: z.literal("notFound"), message: z.string() }),
  z.object({ kind: z.literal("file"), message: z.string() }),
  z.object({ kind: z.literal("update"), message: z.string() }),
]);

export type AppError =
  | z.infer<typeof commandErrorSchema>
  | { kind: "contract"; command: string; issues: string }
  | { kind: "unknown"; message: string };

export class CommandFailure extends Error {
  readonly error: AppError;

  constructor(error: AppError) {
    super(describeError(error).title);
    this.name = "CommandFailure";
    this.error = error;
  }
}

export function parseCommandError(raw: unknown): AppError {
  const parsed = commandErrorSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (typeof raw === "string") return { kind: "unknown", message: raw };
  if (raw instanceof Error) return { kind: "unknown", message: raw.message };
  return { kind: "unknown", message: "The app returned an error it could not describe." };
}

export function toAppError(error: unknown): AppError {
  return error instanceof CommandFailure ? error.error : parseCommandError(error);
}

export interface ErrorDescription {
  title: string;
  detail?: string;
}

function joined(messages: readonly string[]): string | undefined {
  return messages.length > 0 ? messages.join(". ") : undefined;
}

function describeApiError(error: ApiError): ErrorDescription {
  switch (error.kind) {
    case "unauthorized":
      return {
        title: "HackerOne rejected your API credentials",
        detail:
          error.detail ??
          "Check the token identifier and value, or generate a new token on HackerOne. Tokens are revoked when regenerated.",
      };
    case "forbidden":
      return {
        title: "Your API token cannot access this",
        detail: error.detail ?? "The program may be private or your access was removed.",
      };
    case "notFound":
      return { title: "Not found on HackerOne", detail: error.detail ?? undefined };
    case "badRequest":
      return { title: "HackerOne rejected the request", detail: joined(error.messages) };
    case "unprocessable":
      return { title: "HackerOne could not accept this", detail: joined(error.messages) };
    case "rateLimited":
      return {
        title: "Rate limit reached",
        detail:
          error.retryAfterSecs === null
            ? "Wait a minute before trying again."
            : `Try again in ${error.retryAfterSecs} seconds.`,
      };
    case "server":
      return { title: `HackerOne returned a server error (${error.status})`, detail: "Try again shortly." };
    case "unexpectedStatus":
      return {
        title: `Unexpected response from HackerOne (${error.status})`,
        detail: joined(error.messages),
      };
    case "network":
      return { title: "Could not reach HackerOne", detail: error.message };
    case "decode":
      return { title: "HackerOne sent a response this version cannot read", detail: error.message };
    case "foreignLink":
      return { title: "Refused a pagination link outside api.hackerone.com" };
  }
}

export function describeError(error: AppError): ErrorDescription {
  switch (error.kind) {
    case "api":
      return describeApiError(error.error);
    case "notSignedIn":
      return { title: "Sign in to continue" };
    case "credentials":
      return { title: "The system keychain refused the request", detail: error.message };
    case "cache":
      return { title: "The local database failed", detail: error.message };
    case "invalid":
      return { title: capitalize(error.message) };
    case "notFound":
      return { title: capitalize(error.message) };
    case "file":
      return { title: capitalize(error.message) };
    case "update":
      return { title: "The update failed", detail: error.message };
    case "contract":
      return {
        title: `The app received unexpected data from ${error.command}`,
        detail: error.issues,
      };
    case "unknown":
      return { title: error.message };
  }
}

export function isNetworkError(error: AppError): boolean {
  return error.kind === "api" && error.error.kind === "network";
}

export function isAuthError(error: AppError): boolean {
  return error.kind === "notSignedIn" || (error.kind === "api" && error.error.kind === "unauthorized");
}

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
