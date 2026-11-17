import { describe, expect, it } from "vitest";
import {
  CVSS_METRICS,
  CVSS_METRIC_ORDER,
  baseScore,
  formatVector,
  parseVector,
  roundUp,
  severityFor,
  type CvssMetrics,
} from "./cvss";

function score(vector: string): number {
  const metrics = parseVector(vector);
  if (!metrics) throw new Error(`Invalid vector in test: ${vector}`);
  return baseScore(metrics);
}

describe("baseScore", () => {
  it.each([
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8],
    ["AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10.0],
    ["AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", 6.5],
    ["AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H", 7.8],
    ["AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N", 4.7],
    ["AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", 6.1],
    ["AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N", 6.4],
    ["AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H", 9.1],
    ["AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N", 1.6],
    ["AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N", 0.0],
    ["AV:N/AC:L/PR:N/UI:N/S:C/C:N/I:N/A:N", 0.0],
  ])("scores %s as %d", (vector, expected) => {
    expect(score(vector)).toBe(expected);
  });

  it("uses the scope-changed weights for privileges required", () => {
    expect(score("AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:N")).toBe(5.4);
    expect(score("AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:N")).toBe(6.4);
  });
});

describe("roundUp", () => {
  it("follows the specification's integer-based rounding", () => {
    expect(roundUp(4.0)).toBe(4.0);
    expect(roundUp(4.02)).toBe(4.1);
    expect(roundUp(4.000001)).toBe(4.0);
    expect(roundUp(0)).toBe(0);
  });
});

describe("severityFor", () => {
  it.each([
    [0, "none"],
    [0.1, "low"],
    [3.9, "low"],
    [4.0, "medium"],
    [6.9, "medium"],
    [7.0, "high"],
    [8.9, "high"],
    [9.0, "critical"],
    [10, "critical"],
  ] as const)("rates %d as %s", (value, rating) => {
    expect(severityFor(value)).toBe(rating);
  });
});

describe("parseVector and formatVector", () => {
  const metrics: CvssMetrics = { AV: "N", AC: "H", PR: "L", UI: "R", S: "C", C: "L", I: "H", A: "N" };

  it("round-trips", () => {
    const vector = formatVector(metrics);
    expect(vector).toBe("CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:C/C:L/I:H/A:N");
    expect(parseVector(vector)).toEqual(metrics);
  });

  it("accepts v3.0, bare and reordered vectors", () => {
    expect(parseVector("CVSS:3.0/AV:N/AC:H/PR:L/UI:R/S:C/C:L/I:H/A:N")).toEqual(metrics);
    expect(parseVector("AV:N/AC:H/PR:L/UI:R/S:C/C:L/I:H/A:N")).toEqual(metrics);
    expect(parseVector("  CVSS:3.1/A:N/I:H/C:L/S:C/UI:R/PR:L/AC:H/AV:N\n")).toEqual(metrics);
  });

  it("ignores temporal and environmental metrics", () => {
    expect(parseVector("CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:C/C:L/I:H/A:N/E:P/RL:O/MAV:L")).toEqual(metrics);
  });

  it.each([
    "",
    "CVSS:3.1",
    "CVSS:2.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    "CVSS:4.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H",
    "CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    "CVSS:3.1/AV:N/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/ZZ:1",
    "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/",
    "CVSS:3.1/AV:N:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    "cvss:3.1/av:n/ac:l/pr:n/ui:n/s:u/c:h/i:h/a:h",
  ])("rejects %j", (vector) => {
    expect(parseVector(vector)).toBeNull();
  });
});

describe("CVSS_METRICS", () => {
  it("defines every metric in vector order with labelled values", () => {
    expect(Object.keys(CVSS_METRICS)).toEqual(CVSS_METRIC_ORDER);
    for (const key of CVSS_METRIC_ORDER) {
      const definition = CVSS_METRICS[key];
      expect(definition.key).toBe(key);
      expect(definition.values.length).toBeGreaterThan(1);
      for (const option of definition.values) expect(option.label).not.toBe("");
    }
  });
});
