/**
 * Prompts and reply parsing for the composer's AI assistant.
 *
 * Responsibilities:
 * - Build the system and user prompts for each assistant action from draft and program context.
 * - Parse model replies defensively: models wrap JSON in fences or prose, and a reply that does not
 *   match the expected shape is reported as unusable rather than half-applied.
 */
import { z } from "zod";
import type { SeverityRating } from "@/ipc/common";
import type { DraftContent } from "@/ipc/workspace";

/** Program facts the assistant may use. Everything here is already visible to the hacker. */
export interface AssistantProgramContext {
  name: string;
  handle: string;
  policy: string | null;
  asset: string | null;
  weakness: string | null;
  exclusions: readonly { category: string | null; details: string | null }[];
}

/** A rewrite the assistant can apply to one body field. */
export type RewriteAction = "clarify" | "concise" | "steps" | "impact";

/** Labels for {@link RewriteAction}, in menu order. */
export const REWRITE_ACTIONS: readonly { id: RewriteAction; label: string; detail: string }[] = [
  { id: "clarify", label: "Clarify", detail: "Fix grammar and ambiguity without changing facts" },
  { id: "concise", label: "Tighten", detail: "Remove filler and repetition" },
  { id: "steps", label: "Structure steps", detail: "Turn the reproduction into numbered steps" },
  { id: "impact", label: "Sharpen impact", detail: "State the concrete consequence and who is affected" },
];

/** A prompt pair ready for `aiComplete`. */
export interface AssistantPrompt {
  system: string;
  prompt: string;
  json: boolean;
  maxTokens: number;
}

/** Policy text is capped so one long program page cannot crowd out the draft. */
export const POLICY_CHAR_LIMIT = 12_000;

const BASE_SYSTEM = [
  "You help a security researcher write vulnerability reports for a bug bounty program.",
  "Never invent facts, endpoints, payloads, versions or results that are not in the material you are given.",
  "Where information is missing, leave a clear placeholder in square brackets, such as [affected endpoint].",
  "Write plain, specific English for a triage analyst. No marketing tone, no emoji.",
].join(" ");

function programBlock(program: AssistantProgramContext | null): string {
  if (!program) return "Program: not chosen yet.";
  const lines = [
    `Program: ${program.name} (${program.handle})`,
    `Asset: ${program.asset ?? "not chosen"}`,
    `Weakness: ${program.weakness ?? "not chosen"}`,
  ];
  if (program.exclusions.length > 0) {
    lines.push(
      "Excluded categories:",
      ...program.exclusions.map(
        (exclusion) =>
          `- ${exclusion.category ?? "Uncategorised"}${exclusion.details ? `: ${exclusion.details}` : ""}`,
      ),
    );
  }
  return lines.join("\n");
}

function draftBlock(content: DraftContent): string {
  return [
    `Title: ${content.title || "(empty)"}`,
    `Severity: ${content.severityRating ?? "not chosen"}`,
    "",
    "Vulnerability information:",
    content.vulnerabilityInformation || "(empty)",
    "",
    "Impact:",
    content.impact || "(empty)",
  ].join("\n");
}

/**
 * Turns rough notes into a full draft. The reply is a JSON object parsed by
 * {@link parseDraftReply}.
 */
export function draftFromNotesPrompt(
  notes: string,
  program: AssistantProgramContext | null,
): AssistantPrompt {
  return {
    json: true,
    maxTokens: 4096,
    system: `${BASE_SYSTEM} Reply with one JSON object with the keys "title", "vulnerabilityInformation", "impact" and "severity". "severity" is one of none, low, medium, high, critical, or null when the notes do not support a rating. "vulnerabilityInformation" is markdown with the sections "## Summary", "## Steps to reproduce" (numbered) and "## Proof of concept". "title" says what is broken, where, and what it allows, in under 120 characters.`,
    prompt: `${programBlock(program)}\n\nResearcher notes:\n${notes}`,
  };
}

/**
 * Checks a draft against the program policy. The reply is parsed by {@link parsePolicyReply}.
 */
export function policyCheckPrompt(content: DraftContent, program: AssistantProgramContext): AssistantPrompt {
  const policy = (program.policy ?? "").slice(0, POLICY_CHAR_LIMIT);
  return {
    json: true,
    maxTokens: 2048,
    system: `${BASE_SYSTEM} Review the draft against the program policy and the excluded categories. Reply with one JSON object: {"findings": [{"level": "blocker" | "warning" | "note", "message": string}]}. A blocker is something that would get the report closed as out of scope or not applicable. Keep each message to one or two sentences and quote the policy line it relies on. Reply with an empty list when nothing applies.`,
    prompt: `${programBlock(program)}\n\nProgram policy:\n${policy || "(no policy text)"}\n\nDraft:\n${draftBlock(content)}`,
  };
}

const REWRITE_INSTRUCTIONS: Record<RewriteAction, string> = {
  clarify:
    "Fix grammar, spelling and ambiguous wording. Keep every fact, URL, payload and code block exactly as written.",
  concise:
    "Remove filler, repetition and hedging. Keep every fact, URL, payload and code block exactly as written.",
  steps:
    "Rewrite the reproduction as numbered steps a triager can follow without guessing. Keep every fact, URL, payload and code block exactly as written.",
  impact:
    "Rewrite as a concrete impact statement: what an attacker can do, to whom, and under what preconditions. Do not exaggerate beyond what the text supports.",
};

/** Rewrites one markdown field. The reply is the new markdown, cleaned by {@link cleanTextReply}. */
export function rewritePrompt(
  action: RewriteAction,
  text: string,
  program: AssistantProgramContext | null,
): AssistantPrompt {
  return {
    json: false,
    maxTokens: 4096,
    system: `${BASE_SYSTEM} ${REWRITE_INSTRUCTIONS[action]} Reply with only the rewritten markdown, no preface.`,
    prompt: `${programBlock(program)}\n\nText:\n${text}`,
  };
}

/** Suggests three titles. The reply is parsed by {@link parseTitlesReply}. */
export function titlePrompt(content: DraftContent, program: AssistantProgramContext | null): AssistantPrompt {
  return {
    json: true,
    maxTokens: 512,
    system: `${BASE_SYSTEM} Suggest three report titles that say what is broken, where, and what it allows, each under 120 characters. Reply with one JSON object: {"titles": [string, string, string]}.`,
    prompt: `${programBlock(program)}\n\nDraft:\n${draftBlock(content)}`,
  };
}

// -----------------------------------------------------------------------------
// Reply parsing
// -----------------------------------------------------------------------------

/**
 * Pulls the first JSON object out of a model reply, tolerating code fences and surrounding prose.
 */
export function extractJson(reply: string): unknown {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(reply)?.[1];
  const candidate = fenced ?? reply;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Strips a code fence wrapped around a whole markdown reply. */
export function cleanTextReply(reply: string): string {
  const trimmed = reply.trim();
  const fenced = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

const SEVERITIES = ["none", "low", "medium", "high", "critical"] as const;

const draftReplySchema = z.object({
  title: z.string(),
  vulnerabilityInformation: z.string(),
  impact: z.string(),
  severity: z
    .string()
    .nullish()
    .transform((value) => {
      const lower = value?.toLowerCase();
      return SEVERITIES.find((rating) => rating === lower) ?? null;
    }),
});

/** A parsed {@link draftFromNotesPrompt} reply. */
export interface DraftReply {
  title: string;
  vulnerabilityInformation: string;
  impact: string;
  severity: SeverityRating | null;
}

/** Parses a draft reply, or returns null when the model did not follow the format. */
export function parseDraftReply(reply: string): DraftReply | null {
  const parsed = draftReplySchema.safeParse(extractJson(reply));
  return parsed.success ? parsed.data : null;
}

/** One finding from a policy check. */
export interface PolicyFinding {
  level: "blocker" | "warning" | "note";
  message: string;
}

const policyReplySchema = z.object({
  findings: z.array(
    z.object({
      level: z.enum(["blocker", "warning", "note"]).catch("note"),
      message: z.string().min(1),
    }),
  ),
});

/** Parses a policy check reply, or returns null when the model did not follow the format. */
export function parsePolicyReply(reply: string): PolicyFinding[] | null {
  const parsed = policyReplySchema.safeParse(extractJson(reply));
  return parsed.success ? parsed.data.findings : null;
}

/** Parses a title suggestion reply, or returns null when the model did not follow the format. */
export function parseTitlesReply(reply: string): string[] | null {
  const parsed = z.object({ titles: z.array(z.string().min(1)).min(1) }).safeParse(extractJson(reply));
  return parsed.success ? parsed.data.titles.slice(0, 3).map((title) => title.trim()) : null;
}
