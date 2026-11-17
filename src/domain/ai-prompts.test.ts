import { describe, expect, it } from "vitest";
import type { DraftContent } from "@/ipc/workspace";
import {
  POLICY_CHAR_LIMIT,
  cleanTextReply,
  draftFromNotesPrompt,
  extractJson,
  parseDraftReply,
  parsePolicyReply,
  parseTitlesReply,
  policyCheckPrompt,
  rewritePrompt,
  type AssistantProgramContext,
} from "./ai-prompts";

const program: AssistantProgramContext = {
  name: "Initech",
  handle: "initech",
  policy: "Do not test denial of service.",
  asset: "app.initech.example",
  weakness: "Cross-site Scripting (XSS) - Stored",
  exclusions: [{ category: "Self-XSS", details: "Requires the victim to paste code" }],
};

const content: DraftContent = {
  programHandle: "initech",
  title: "Stored XSS",
  structuredScopeId: null,
  weaknessId: null,
  severityRating: "high",
  vulnerabilityInformation: "Body",
  impact: "",
  acknowledgedExclusions: [],
};

describe("prompts", () => {
  it("includes program context and asks for JSON when drafting", () => {
    const prompt = draftFromNotesPrompt("found xss in bio", program);
    expect(prompt.json).toBe(true);
    expect(prompt.prompt).toContain("app.initech.example");
    expect(prompt.prompt).toContain("Self-XSS: Requires the victim to paste code");
    expect(prompt.prompt).toContain("found xss in bio");
    expect(prompt.system).toContain("Never invent facts");
  });

  it("handles a draft without a program", () => {
    expect(draftFromNotesPrompt("notes", null).prompt).toContain("Program: not chosen yet.");
  });

  it("caps policy text", () => {
    const long = { ...program, policy: "x".repeat(POLICY_CHAR_LIMIT + 500) };
    const prompt = policyCheckPrompt(content, long);
    expect(/x{100,}/.exec(prompt.prompt)?.[0]).toHaveLength(POLICY_CHAR_LIMIT);
    expect(prompt.prompt).toContain("Impact:\n(empty)");
  });

  it("asks for plain markdown when rewriting", () => {
    const prompt = rewritePrompt("steps", "do the thing", program);
    expect(prompt.json).toBe(false);
    expect(prompt.system).toContain("numbered steps");
  });
});

describe("reply parsing", () => {
  it("extracts JSON from fences and prose", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(extractJson("no json here")).toBeNull();
    expect(extractJson("{broken")).toBeNull();
  });

  it("parses a draft and normalises severity", () => {
    const reply = JSON.stringify({
      title: "T",
      vulnerabilityInformation: "V",
      impact: "I",
      severity: "High",
    });
    expect(parseDraftReply(reply)).toEqual({
      title: "T",
      vulnerabilityInformation: "V",
      impact: "I",
      severity: "high",
    });
    const unknown = JSON.stringify({
      title: "T",
      vulnerabilityInformation: "V",
      impact: "I",
      severity: "severe",
    });
    expect(parseDraftReply(unknown)?.severity).toBeNull();
    expect(parseDraftReply('{"title":"T"}')).toBeNull();
  });

  it("parses policy findings and tolerates unknown levels", () => {
    const reply = JSON.stringify({
      findings: [
        { level: "blocker", message: "DoS" },
        { level: "odd", message: "x" },
      ],
    });
    expect(parsePolicyReply(reply)).toEqual([
      { level: "blocker", message: "DoS" },
      { level: "note", message: "x" },
    ]);
    expect(parsePolicyReply('{"findings":[]}')).toEqual([]);
    expect(parsePolicyReply("nothing")).toBeNull();
  });

  it("parses at most three titles", () => {
    expect(parseTitlesReply('{"titles":[" a ","b","c","d"]}')).toEqual(["a", "b", "c"]);
    expect(parseTitlesReply('{"titles":[]}')).toBeNull();
  });

  it("strips a fence around a markdown reply", () => {
    expect(cleanTextReply("```markdown\n## Hi\n\ntext\n```")).toBe("## Hi\n\ntext");
    expect(cleanTextReply("  plain  ")).toBe("plain");
  });
});
