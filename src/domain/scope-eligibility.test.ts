import { describe, expect, it } from "vitest";
import { scope } from "@/testing/fixtures";
import {
  groupByAssetType,
  matchAsset,
  scopeExport,
  scopeMatchesAsset,
  submittableScopes,
} from "./scope-eligibility";

const scopes = [
  scope({ id: "1", assetIdentifier: "*.acme.com", assetType: "WILDCARD" }),
  scope({ id: "2", assetIdentifier: "legacy.acme.com", eligibleForSubmission: false }),
  scope({ id: "3", assetIdentifier: "api.acme.com", assetType: "url" }),
  scope({ id: "4", assetIdentifier: "com.acme.android", assetType: "GOOGLE_PLAY_APP_ID" }),
];

describe("submittableScopes", () => {
  it("keeps only assets that accept submissions", () => {
    expect(submittableScopes(scopes).map((s) => s.id)).toEqual(["1", "3", "4"]);
  });
});

describe("groupByAssetType", () => {
  it("groups case-insensitively with eligible assets first", () => {
    const groups = groupByAssetType(scopes);
    expect(groups.map((group) => group.assetType)).toEqual(["GOOGLE_PLAY_APP_ID", "URL", "WILDCARD"]);
    expect(groups.find((group) => group.assetType === "URL")?.scopes.map((s) => s.id)).toEqual(["3", "2"]);
  });
});

describe("scopeMatchesAsset", () => {
  it("matches wildcards against subdomains but not the apex", () => {
    const wildcard = scopes[0];
    if (!wildcard) throw new Error("fixture missing");
    expect(scopeMatchesAsset(wildcard, "https://shop.acme.com/cart?id=1")).toBe(true);
    expect(scopeMatchesAsset(wildcard, "acme.com")).toBe(false);
    expect(scopeMatchesAsset(wildcard, "acme.com.evil.example")).toBe(false);
  });

  it("matches hosts inside URLs and exact identifiers", () => {
    const api = scopes[2];
    const app = scopes[3];
    if (!api || !app) throw new Error("fixture missing");
    expect(scopeMatchesAsset(api, "https://API.acme.com/v2/users")).toBe(true);
    expect(scopeMatchesAsset(app, "com.acme.android")).toBe(true);
    expect(scopeMatchesAsset(app, "com.acme")).toBe(false);
  });
});

describe("matchAsset", () => {
  it("prefers an exact eligible match over a wildcard", () => {
    const match = matchAsset(scopes, "api.acme.com");
    expect(match).toMatchObject({ kind: "eligible", scope: { id: "3" } });
  });

  it("falls back to a covering wildcard when the exact asset is not eligible", () => {
    expect(matchAsset(scopes, "legacy.acme.com")).toMatchObject({ kind: "eligible", scope: { id: "1" } });
  });

  it("reports ineligible and unknown assets", () => {
    const strict = [scope({ id: "9", assetIdentifier: "old.acme.com", eligibleForSubmission: false })];
    expect(matchAsset(strict, "https://old.acme.com/x")).toMatchObject({ kind: "ineligible" });
    expect(matchAsset(strict, "other.example")).toEqual({ kind: "none" });
  });
});

describe("scopeExport", () => {
  it("exports one identifier per line or structured JSON", () => {
    const subset = scopes.slice(0, 2);
    expect(scopeExport(subset, "plain")).toBe("*.acme.com\nlegacy.acme.com");
    expect(JSON.parse(scopeExport(subset, "json"))).toEqual([
      expect.objectContaining({ asset_identifier: "*.acme.com", eligible_for_submission: true }),
      expect.objectContaining({ asset_identifier: "legacy.acme.com", eligible_for_submission: false }),
    ]);
  });
});
