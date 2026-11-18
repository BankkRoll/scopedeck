import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  const start = "2026-01-01T00:00:00Z";

  it("scales from minutes to days", () => {
    expect(formatDuration(start, "2026-01-01T00:00:20Z")).toBe("under a minute");
    expect(formatDuration(start, "2026-01-01T00:45:00Z")).toBe("45 min");
    expect(formatDuration(start, "2026-01-01T06:10:00Z")).toBe("6 h");
    expect(formatDuration(start, "2026-01-03T12:00:00Z")).toBe("2.5 days");
    expect(formatDuration(start, "2026-02-01T00:00:00Z")).toBe("31 days");
  });

  it("is empty for missing or reversed timestamps", () => {
    expect(formatDuration(null, start)).toBe("");
    expect(formatDuration(start, undefined)).toBe("");
    expect(formatDuration("2026-01-02T00:00:00Z", start)).toBe("");
  });
});
