import { describe, expect, it } from "vitest";
import type { Severity } from "@/ipc/reports";
import { severityVector } from "./severity-vector";

const base: Severity = {
  id: "1",
  rating: "critical",
  authorType: "User",
  score: 9.8,
  attackVector: "network",
  attackComplexity: "low",
  privilegesRequired: "none",
  userInteraction: "none",
  scope: "unchanged",
  confidentiality: "high",
  integrity: "high",
  availability: "high",
  createdAt: null,
};

describe("severityVector", () => {
  it("builds a 3.1 vector from the API metric names", () => {
    expect(severityVector(base)).toBe("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
  });

  it("accepts adjacent network and mixed case", () => {
    expect(severityVector({ ...base, attackVector: "Adjacent Network", scope: "Changed" })).toBe(
      "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
    );
  });

  it("is null when a metric is missing or unknown", () => {
    expect(severityVector({ ...base, integrity: null })).toBeNull();
    expect(severityVector({ ...base, attackVector: "teleport" })).toBeNull();
    expect(severityVector(null)).toBeNull();
  });
});
