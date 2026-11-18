import { describe, expect, it } from "vitest";
import { disclosableActionLabel, timeToDisclose } from "./hacktivity-display";

describe("disclosableActionLabel", () => {
  it("maps known activity classes", () => {
    expect(disclosableActionLabel("Activities::ReportBecamePublic")).toBe("Disclosed");
    expect(disclosableActionLabel("Activities::BountyAwarded")).toBe("Bounty awarded");
    expect(disclosableActionLabel("Activities::CveIdAdded")).toBe("CVE assigned");
  });

  it("humanises the last segment of unknown actions", () => {
    expect(disclosableActionLabel("Activities::ExternalUserJoined")).toBe("External user joined");
    expect(disclosableActionLabel("Activities::HackerRequestedMediation")).toBe("Hacker requested mediation");
    expect(disclosableActionLabel("SLAReminderSent")).toBe("SLA reminder sent");
  });

  it("is empty without an action", () => {
    expect(disclosableActionLabel(null)).toBe("");
    expect(disclosableActionLabel("")).toBe("");
    expect(disclosableActionLabel("Activities::")).toBe("");
  });
});

describe("timeToDisclose", () => {
  it("spans submission to disclosure", () => {
    expect(timeToDisclose("2026-01-01T00:00:00Z", "2026-01-13T00:00:00Z")).toBe("12 days");
  });

  it("is empty when a side is missing", () => {
    expect(timeToDisclose(null, "2026-01-13T00:00:00Z")).toBe("");
    expect(timeToDisclose("2026-01-01T00:00:00Z", null)).toBe("");
  });
});
