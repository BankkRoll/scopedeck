import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUILDER_STATE,
  EMPTY_FILTERS,
  apiDate,
  compileQuery,
  filterProblems,
  luceneValue,
  queryStringFor,
} from "./hacktivity-query";

describe("compileQuery", () => {
  it("only asks for disclosed reports by default", () => {
    expect(compileQuery(EMPTY_FILTERS)).toBe("disclosed:true");
    expect(compileQuery({ ...EMPTY_FILTERS, disclosedOnly: false })).toBe("");
  });

  it("joins every filter with AND and groups multi-value fields with OR", () => {
    const query = compileQuery({
      ...EMPTY_FILTERS,
      severities: ["critical", "high"],
      assetTypes: ["URL"],
      cwe: "79",
      cve: "cve-2024-1234, CVE-2023-9999",
      program: "acme",
      reporter: "finder",
      minBounty: 500,
      maxBounty: 5000,
      disclosedFrom: "2024-01-31",
      disclosedTo: "2024-12-01",
      collaboration: "yes",
    });
    expect(query).toBe(
      [
        "disclosed:true",
        "severity_rating:(critical OR high)",
        "asset_type:URL",
        "cwe:CWE-79",
        "cve_ids:(CVE-2024-1234 OR CVE-2023-9999)",
        "team:acme",
        "reporter:finder",
        "total_awarded_amount:>=500",
        "total_awarded_amount:<=5000",
        "disclosed_at:>=31-01-2024",
        "disclosed_at:<=01-12-2024",
        "has_collaboration:true",
      ].join(" AND "),
    );
  });

  it("quotes free text so it cannot inject Lucene operators", () => {
    expect(compileQuery({ ...EMPTY_FILTERS, disclosedOnly: false, cwe: "Cross-site Scripting (XSS)" })).toBe(
      'cwe:"Cross-site Scripting (XSS)"',
    );
    expect(luceneValue('a" OR disclosed:false')).toBe('"a\\" OR disclosed:false"');
    expect(luceneValue("OR")).toBe('"OR"');
    expect(luceneValue("-negated")).toBe('"-negated"');
    expect(luceneValue("back\\slash")).toBe('"back\\\\slash"');
  });

  it("deduplicates repeated values and can filter for solo reports", () => {
    expect(
      compileQuery({ ...EMPTY_FILTERS, program: "acme acme", collaboration: "no", disclosedOnly: false }),
    ).toBe("team:acme AND has_collaboration:false");
  });

  it("formats dates the way the API documents them", () => {
    expect(apiDate("1970-01-01")).toBe("01-01-1970");
  });
});

describe("queryStringFor", () => {
  it("uses the raw query verbatim in raw mode", () => {
    expect(queryStringFor({ ...DEFAULT_BUILDER_STATE, mode: "raw", raw: "  votes:>10 " })).toBe("votes:>10");
    expect(queryStringFor(DEFAULT_BUILDER_STATE)).toBe("disclosed:true");
  });
});

describe("filterProblems", () => {
  it("reports inverted ranges and malformed CVEs", () => {
    const problems = filterProblems({
      ...EMPTY_FILTERS,
      minBounty: 10,
      maxBounty: 5,
      disclosedFrom: "2024-02-01",
      disclosedTo: "2024-01-01",
      cve: "CVE-2024-1, nonsense",
    });
    expect(problems.map((problem) => problem.field)).toEqual(["maxBounty", "disclosedTo", "cve", "cve"]);
  });
});
