import { describe, expect, it } from "vitest";
import type { DraftContent } from "@/ipc/workspace";
import { draftQuality, type DraftCheckId } from "./draft-quality";
import { templateForWeakness } from "./report-templates";

const strong: DraftContent = {
  programHandle: "acme",
  title: "Stored XSS in profile bio executes for every profile visitor",
  structuredScopeId: "1",
  weaknessId: "60",
  severityRating: "high",
  vulnerabilityInformation: [
    "## Summary",
    "The bio field on https://www.acme.com/profile renders raw HTML.",
    "",
    "## Steps to reproduce",
    "1. Log in.",
    "2. Set the bio to the payload below.",
    "3. Open the profile as another user.",
    "",
    "```html",
    "<img src=x onerror=alert(document.domain)>",
    "```",
  ].join("\n"),
  impact:
    "Any visitor to the profile runs attacker JavaScript in their session, which can read their messages and change their email address.",
  acknowledgedExclusions: [],
};

const empty: DraftContent = {
  programHandle: null,
  title: "",
  structuredScopeId: null,
  weaknessId: null,
  severityRating: null,
  vulnerabilityInformation: "",
  impact: "",
  acknowledgedExclusions: [],
};

function failed(content: DraftContent, weaknessName?: string): DraftCheckId[] {
  const context = weaknessName === undefined ? {} : { weaknessName };
  return draftQuality(content, context)
    .checks.filter((check) => !check.passed)
    .map((check) => check.id);
}

describe("draftQuality", () => {
  it("scores a complete draft 100", () => {
    const result = draftQuality(strong);
    expect(result.score).toBe(100);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("weights add up to 100", () => {
    expect(draftQuality(strong).checks.reduce((sum, check) => sum + check.weight, 0)).toBe(100);
  });

  it("scores an empty draft low, passing only the placeholder check", () => {
    expect(draftQuality(empty).score).toBe(10);
    expect(failed(empty)).not.toContain("no-placeholders");
  });

  it("gives every check a label and hint", () => {
    for (const check of draftQuality(empty).checks) {
      expect(check.label).not.toBe("");
      expect(check.hint).not.toBe("");
    }
  });

  describe("title", () => {
    it.each(["XSS", "Cross-site scripting vulnerability found", "Stored XSS vulnerability in the app"])(
      "flags generic title %j",
      (title) => {
        expect(failed({ ...strong, title })).toContain("specific-title");
      },
    );

    it("treats words from the weakness name as generic", () => {
      const title = "Improper Access Control - Generic issue";
      expect(failed({ ...strong, title })).not.toContain("specific-title");
      expect(failed({ ...strong, title }, "Improper Access Control - Generic")).toContain("specific-title");
    });
  });

  it("accepts a steps heading without a numbered list", () => {
    const body = "Steps:\n- Log in\n- Visit https://acme.com/a/b";
    expect(failed({ ...strong, vulnerabilityInformation: body })).not.toContain("steps");
    expect(failed({ ...strong, vulnerabilityInformation: "Log in and visit the page." })).toContain("steps");
  });

  it.each([
    ["a code fence", "1. Do it\n\n~~~\npayload\n~~~"],
    ["a URL", "1. Visit https://acme.com/x"],
    ["a raw request", "1. Send\n\nPOST /api/users HTTP/1.1"],
    ["a curl command", "1. Run curl -X POST acme"],
  ])("finds a proof of concept in %s", (_, body) => {
    expect(failed({ ...strong, vulnerabilityInformation: body })).not.toContain("proof-of-concept");
  });

  it("requires an endpoint, URL or path", () => {
    const without = (body: string) => failed({ ...strong, vulnerabilityInformation: body });
    expect(without("1. Use the api and/or the app")).toContain("endpoint");
    expect(without("1. Dated 1/2/2024")).toContain("endpoint");
    expect(without("1. Call `/api/v2/orders/{id}`")).not.toContain("endpoint");
  });

  it("requires a substantial impact", () => {
    expect(failed({ ...strong, impact: "Data exposure." })).toContain("impact");
  });

  it("flags unset severity, asset and weakness", () => {
    expect(failed({ ...strong, severityRating: null, structuredScopeId: null, weaknessId: null })).toEqual([
      "severity",
      "asset",
      "weakness",
    ]);
  });

  it.each(["TODO: add payload", "Lorem ipsum dolor", "<insert payload here>", "[Describe the impact.]"])(
    "flags placeholder %j",
    (text) => {
      expect(failed({ ...strong, impact: `${strong.impact} ${text}` })).toContain("no-placeholders");
    },
  );

  it("flags an untouched built-in template as unfinished", () => {
    const template = templateForWeakness({
      name: "Cross-site Scripting (XSS) - Stored",
      externalId: "cwe-79",
    });
    const draft = {
      ...strong,
      vulnerabilityInformation: template.vulnerabilityInformation,
      impact: template.impact,
    };
    expect(failed(draft)).toContain("no-placeholders");
  });
});
