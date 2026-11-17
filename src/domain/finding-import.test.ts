import { describe, expect, it } from "vitest";
import { scope, weakness } from "@/testing/fixtures";
import { mapFinding, parseFinding, type Finding } from "./finding-import";

const context = {
  scopes: [
    scope({ id: "10", assetIdentifier: "*.acme.com", assetType: "WILDCARD" }),
    scope({ id: "11", assetIdentifier: "admin.acme.com", eligibleForSubmission: false }),
  ],
  weaknesses: [
    weakness({ id: "60", name: "Cross-site Scripting (XSS) - Stored", externalId: "cwe-79" }),
    weakness({ id: "61", name: "Information Disclosure", externalId: "cwe-200" }),
  ],
};

const base: Finding = {
  schemaVersion: 1,
  title: "Stored XSS in profile bio",
  asset: "https://www.acme.com/profile",
  weakness: { cwe: "CWE-79" },
  severity: { rating: "high", cvss: "CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N" },
  summary: "The bio field renders HTML.",
  steps: ["Log in", "Set the bio to <img src=x onerror=alert(1)>", "Open the profile"],
  impact: "Session riding against any visitor.",
  poc: "<img src=x onerror=alert(1)>",
  references: ["https://owasp.org/www-community/attacks/xss/"],
};

describe("parseFinding", () => {
  it("accepts a valid document", () => {
    const parsed = parseFinding(JSON.stringify(base));
    expect(parsed.ok).toBe(true);
  });

  it("explains invalid JSON and schema violations", () => {
    expect(parseFinding("{").ok).toBe(false);
    const parsed = parseFinding(JSON.stringify({ schemaVersion: 2, title: "", steps: [] }));
    expect(parsed).toMatchObject({ ok: false });
    if (!parsed.ok) {
      expect(parsed.errors.join("\n")).toMatch(/schemaVersion/);
      expect(parsed.errors.join("\n")).toMatch(/impact/);
    }
  });
});

describe("mapFinding", () => {
  it("maps a fully matching finding without issues", () => {
    const result = mapFinding(base, context);
    expect(result.issues).toEqual([]);
    expect(result.content).toMatchObject({
      title: "Stored XSS in profile bio",
      structuredScopeId: "10",
      weaknessId: "60",
      severityRating: "high",
      impact: "Session riding against any visitor.",
    });
    expect(result.content.vulnerabilityInformation).toContain("1. Log in\n2. Set the bio");
    expect(result.content.vulnerabilityInformation).toContain("```\n<img src=x onerror=alert(1)>\n```");
    expect(result.content.vulnerabilityInformation).toContain("CVSS:3.1/AV:N");
  });

  it("matches weaknesses by name or bare CWE number", () => {
    expect(mapFinding({ ...base, weakness: "information disclosure" }, context).content.weaknessId).toBe(
      "61",
    );
    expect(mapFinding({ ...base, weakness: 200 }, context).content.weaknessId).toBe("61");
  });

  it("flags every field it could not match", () => {
    const result = mapFinding(
      { ...base, asset: "https://admin.acme.com", weakness: "CWE-918", severity: undefined },
      { ...context, scopes: context.scopes.slice(1) },
    );
    expect(result.issues.map((issue) => issue.field)).toEqual(["asset", "weakness", "severity"]);
    expect(result.content.structuredScopeId).toBeNull();
    expect(result.content.weaknessId).toBeNull();
    expect(result.issues[0]?.message).toMatch(/does not accept submissions/);
  });

  it("flags unknown and missing assets", () => {
    expect(mapFinding({ ...base, asset: "other.example" }, context).issues[0]?.message).toMatch(
      /not in this program's scope/,
    );
    expect(mapFinding({ ...base, asset: undefined }, context).issues[0]?.field).toBe("asset");
  });

  it("keeps fenced proof of concept untouched", () => {
    const poc = "```http\nGET / HTTP/1.1\n```";
    expect(mapFinding({ ...base, poc }, context).content.vulnerabilityInformation).toContain(poc);
  });
});
