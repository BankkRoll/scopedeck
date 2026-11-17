import { describe, expect, it } from "vitest";
import { extractCvssVector, upsertCvssSection } from "./cvss-section";

const VECTOR = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
const OTHER = "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N";

describe("cvss section", () => {
  it("appends a section to a body without one", () => {
    const body = upsertCvssSection("## Summary\n\nText", VECTOR);
    expect(body).toBe(`## Summary\n\nText\n\n## CVSS\n\n\`${VECTOR}\`\n`);
    expect(extractCvssVector(body)).toBe(VECTOR);
  });

  it("replaces an existing section in place", () => {
    const body = `## CVSS\n\n\`${VECTOR}\`\n\n## References\n\n- x`;
    const next = upsertCvssSection(body, OTHER);
    expect(extractCvssVector(next)).toBe(OTHER);
    expect(next).toContain("## References");
    expect(next.match(/## CVSS/g)).toHaveLength(1);
  });

  it("normalises 3.0 vectors and ignores invalid ones", () => {
    expect(extractCvssVector("## CVSS\n\n`CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`")).toBe(VECTOR);
    expect(extractCvssVector("## CVSS\n\n`nonsense`")).toBeNull();
    expect(extractCvssVector("")).toBeNull();
  });

  it("starts an empty body with the section", () => {
    expect(upsertCvssSection("", VECTOR)).toBe(`## CVSS\n\n\`${VECTOR}\`\n`);
  });
});
