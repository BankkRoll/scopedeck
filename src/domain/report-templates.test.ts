import { describe, expect, it } from "vitest";
import { templateForWeakness, weaknessFamily, type WeaknessFamily } from "./report-templates";

describe("weaknessFamily", () => {
  it.each<[string, string | null, WeaknessFamily]>([
    ["Cross-site Scripting (XSS) - Stored", "cwe-79", "xss"],
    ["Anything", "CWE-79", "xss"],
    ["Insecure Direct Object Reference (IDOR)", "cwe-639", "idor"],
    ["Server-Side Request Forgery (SSRF)", "cwe-918", "ssrf"],
    ["SQL Injection", "cwe-89", "sqli"],
    ["Cross-Site Request Forgery (CSRF)", "cwe-352", "csrf"],
    ["Open Redirect", "cwe-601", "open-redirect"],
    ["Improper Authentication - Generic", "cwe-287", "auth-bypass"],
    ["Information Disclosure", "cwe-200", "information-disclosure"],
    ["OS Command Injection", "cwe-78", "rce"],
    ["Deserialization of Untrusted Data", "cwe-502", "rce"],
    ["Business Logic Errors", "cwe-840", "business-logic"],
    ["Clickjacking", "cwe-1021", "generic"],
  ])("maps %s (%s) to %s", (name, externalId, family) => {
    expect(weaknessFamily({ name, externalId })).toBe(family);
  });

  it.each<[string, WeaknessFamily]>([
    ["Reflected XSS", "xss"],
    ["Server-Side Request Forgery (SSRF)", "ssrf"],
    ["Cross-Site Request Forgery", "csrf"],
    ["Blind SQLi", "sqli"],
    ["Broken Object Level Authorization (BOLA)", "idor"],
    ["Account Takeover", "auth-bypass"],
    ["Remote Code Execution", "rce"],
    ["Server-Side Template Injection", "rce"],
    ["Race Condition", "business-logic"],
    ["URL Redirection to Untrusted Site", "open-redirect"],
    ["Something unusual", "generic"],
  ])("matches name %j without a CWE", (name, family) => {
    expect(weaknessFamily({ name, externalId: null })).toBe(family);
  });

  it("falls back to the name when the CWE is unknown", () => {
    expect(weaknessFamily({ name: "Stored XSS", externalId: "cwe-99999" })).toBe("xss");
    expect(weaknessFamily({ name: "Stored XSS", externalId: "capec-63" })).toBe("xss");
  });

  it("returns generic without a weakness", () => {
    expect(weaknessFamily(null)).toBe("generic");
  });
});

describe("templateForWeakness", () => {
  const samples: Record<WeaknessFamily, string> = {
    xss: "XSS",
    idor: "IDOR",
    ssrf: "SSRF",
    sqli: "SQL injection",
    csrf: "CSRF",
    "open-redirect": "Open redirect",
    "auth-bypass": "Authentication bypass",
    "information-disclosure": "Information disclosure",
    rce: "Command injection",
    "business-logic": "Business logic",
    generic: "Other",
  };
  const families = Object.keys(samples) as WeaknessFamily[];

  it.each(families)("builds a complete skeleton for %s", (family) => {
    const template = templateForWeakness({ name: samples[family], externalId: null });
    expect(template.family).toBe(family);
    expect(template.label).not.toBe("");
    for (const heading of [
      "## Summary",
      "## Affected endpoint",
      "## Steps to reproduce",
      "## Proof of concept",
      "## Remediation suggestion",
    ]) {
      expect(template.vulnerabilityInformation).toContain(heading);
    }
    expect(template.vulnerabilityInformation).toMatch(/^1\. /m);
    expect(template.vulnerabilityInformation).toMatch(/\[Describe /);
    expect(template.impact).toMatch(/^\[Explain /);
  });

  it("uses the generic skeleton when nothing is selected", () => {
    expect(templateForWeakness(null).family).toBe("generic");
  });

  it("gives each family distinct guidance", () => {
    const impacts = new Set(
      families.map((family) => templateForWeakness({ name: samples[family], externalId: null }).impact),
    );
    expect(impacts.size).toBe(families.length);
  });
});
