/**
 * Commands for the optional AI assistant and per-program notes.
 *
 * The provider API key is write-only from here: it is sent to the core once and stored in the OS
 * keychain, and no command ever returns it.
 */
import { z } from "zod";
import { call } from "./invoke";

/** The AI providers the core can talk to. */
export const AI_PROVIDERS = ["anthropic", "openai", "ollama"] as const;
/** One of {@link AI_PROVIDERS}. */
export type AiProvider = (typeof AI_PROVIDERS)[number];

const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string(),
  baseUrl: z.string().nullable(),
  enabled: z.boolean(),
  hasKey: z.boolean(),
});
/** Stored assistant configuration. `hasKey` reports whether a key is in the keychain. */
export type AiSettings = z.infer<typeof aiSettingsSchema>;

/** Input for {@link aiSettingsSave}. */
export interface AiSettingsInput {
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  enabled: boolean;
  /** `null` keeps the stored key, an empty string clears it, anything else replaces it. */
  apiKey: string | null;
}

/** Reads the assistant configuration. */
export const aiSettingsGet = () => call("ai_settings_get", aiSettingsSchema);
/** Saves the assistant configuration and returns what was stored. */
export const aiSettingsSave = (input: AiSettingsInput) =>
  call("ai_settings_save", aiSettingsSchema, { ...input });

const aiTestSchema = z.object({ ok: z.boolean(), model: z.string(), latencyMs: z.number() });
/** Sends a tiny request to the configured provider. Works while the assistant is disabled. */
export const aiTest = () => call("ai_test", aiTestSchema);

/** Input for {@link aiComplete}. */
export interface AiCompleteInput {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Ask the provider for a JSON object. The reply is still returned as text. */
  json?: boolean;
}

/** Runs one completion against the configured provider. */
export const aiComplete = (input: AiCompleteInput) =>
  call("ai_complete", z.object({ text: z.string() }), {
    system: input.system,
    prompt: input.prompt,
    maxTokens: input.maxTokens ?? null,
    json: input.json ?? null,
  });

const programNoteSchema = z.object({ body: z.string(), updatedAt: z.string() });
/** A private note kept locally for a program. */
export type ProgramNote = z.infer<typeof programNoteSchema>;

/** Reads the local note for a program, or null when there is none. */
export const programNoteGet = (handle: string) =>
  call("program_note_get", programNoteSchema.nullable(), { handle });
/** Saves the note for a program. A blank body deletes it. */
export const programNoteSave = (handle: string, body: string) =>
  call("program_note_save", programNoteSchema, { handle, body });
