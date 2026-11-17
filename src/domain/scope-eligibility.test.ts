import { describe, expect, it } from "vitest";
import { scope } from "@/testing/fixtures";
import {
  groupByAssetType,
  RECON_FORMATS,
  matchAsset,
  reconExport,
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

interface BurpExport {
  target: {
    scope: {
      advanced_mode: boolean;
      include: Record<string, unknown>[];
      exclude: Record<string, unknown>[];
    };
  };
}

describe("reconExport", () => {
  const recon = [
    scope({ id: "w1", assetIdentifier: "*.Acme.com", assetType: "WILDCARD" }),
    scope({ id: "w2", assetIdentifier: "https://*.shop.acme.com", assetType: "WILDCARD" }),
    scope({ id: "w3", assetIdentifier: "api.*.globex.io", assetType: "WILDCARD" }),
    scope({ id: "u1", assetIdentifier: "https://API.acme.com/v2/Users", assetType: "URL" }),
    scope({ id: "u2", assetIdentifier: "acme.com", assetType: "URL" }),
    scope({ id: "u3", assetIdentifier: "http://admin.acme.com:8080/", assetType: "URL" }),
    scope({ id: "u4", assetIdentifier: "www.acme.com, blog.acme.com", assetType: "DOMAIN" }),
    scope({ id: "u5", assetIdentifier: "acme.com", assetType: "URL" }),
    scope({ id: "u6", assetIdentifier: "https://203.0.113.7/login", assetType: "URL" }),
    scope({ id: "n1", assetIdentifier: "10.0.0.0/24", assetType: "CIDR" }),
    scope({ id: "n2", assetIdentifier: "198.51.100.4", assetType: "IP_ADDRESS" }),
    scope({ id: "n3", assetIdentifier: "2001:DB8::/32", assetType: "CIDR" }),
    scope({ id: "a1", assetIdentifier: "com.acme.android", assetType: "GOOGLE_PLAY_APP_ID" }),
    scope({ id: "o1", assetIdentifier: "Anything owned by Acme", assetType: "OTHER" }),
    scope({ id: "x1", assetIdentifier: "legacy.acme.com", eligibleForSubmission: false }),
    scope({
      id: "x2",
      assetIdentifier: "*.internal.acme.com",
      assetType: "WILDCARD",
      eligibleForSubmission: false,
    }),
  ];

  it("keeps plain and JSON exports identical to scopeExport, ineligible assets included", () => {
    expect(reconExport(recon, "plain")).toBe(scopeExport(recon, "plain"));
    expect(reconExport(recon, "json")).toBe(scopeExport(recon, "json"));
    expect(reconExport(recon, "plain")).toContain("legacy.acme.com");
  });

  it("lists hosts with wildcards stripped to the apex and URLs reduced to the host", () => {
    expect(reconExport(recon, "hosts").split("\n")).toEqual([
      "acme.com",
      "admin.acme.com",
      "api.acme.com",
      "blog.acme.com",
      "globex.io",
      "shop.acme.com",
      "www.acme.com",
    ]);
  });

  it("lists only wildcard apex domains for subfinder", () => {
    expect(reconExport(recon, "wildcards")).toBe("acme.com\nglobex.io\nshop.acme.com");
  });

  it("prefixes bare hosts with https and keeps explicit schemes, ports and path case", () => {
    expect(reconExport(recon, "urls").split("\n")).toEqual([
      "http://admin.acme.com:8080",
      "https://203.0.113.7/login",
      "https://acme.com",
      "https://api.acme.com/v2/Users",
      "https://blog.acme.com",
      "https://www.acme.com",
    ]);
  });

  it("exports nuclei targets identical to URLs", () => {
    expect(reconExport(recon, "nuclei")).toBe(reconExport(recon, "urls"));
  });

  it("collects IP addresses and ranges, including IP hosts written as URLs", () => {
    expect(reconExport(recon, "cidr").split("\n")).toEqual([
      "10.0.0.0/24",
      "198.51.100.4",
      "2001:db8::/32",
      "203.0.113.7",
    ]);
  });

  it("builds a Burp target scope with escaped host regexes and excludes ineligible assets", () => {
    const { advanced_mode, include, exclude } = (JSON.parse(reconExport(recon, "burp")) as BurpExport).target
      .scope;
    expect(advanced_mode).toBe(true);
    expect(include).toContainEqual({
      enabled: true,
      file: "^/.*",
      host: String.raw`^.*\.acme\.com$`,
      port: "^(80|443)$",
      protocol: "any",
    });
    expect(include).toContainEqual(expect.objectContaining({ host: String.raw`^api\..*\.globex\.io$` }));
    expect(include).toContainEqual({
      enabled: true,
      file: "^/v2/Users.*",
      host: String.raw`^api\.acme\.com$`,
      port: "^(80|443)$",
      protocol: "https",
    });
    expect(include).toContainEqual(
      expect.objectContaining({
        host: String.raw`^admin\.acme\.com$`,
        port: "^8080$",
        protocol: "http",
        file: "^/.*",
      }),
    );
    expect(include.filter((rule) => rule.host === String.raw`^acme\.com$`)).toHaveLength(1);
    expect(include).toContainEqual(expect.objectContaining({ host: String.raw`^198\.51\.100\.4$` }));
    expect(include.some((rule) => String(rule.host).includes("/"))).toBe(false);
    expect(exclude.map((rule) => rule.host)).toEqual([
      String.raw`^legacy\.acme\.com$`,
      String.raw`^.*\.internal\.acme\.com$`,
    ]);
  });

  it("returns empty text when nothing fits a tool format", () => {
    const apps = [scope({ id: "a", assetIdentifier: "com.acme.android", assetType: "GOOGLE_PLAY_APP_ID" })];
    for (const format of ["hosts", "wildcards", "urls", "cidr", "burp", "nuclei"] as const) {
      expect(reconExport(apps, format)).toBe("");
    }
  });

  it("drops wildcards without a usable apex", () => {
    const odd = [
      scope({ id: "a", assetIdentifier: "*.acme.*", assetType: "WILDCARD" }),
      scope({ id: "b", assetIdentifier: "*", assetType: "WILDCARD" }),
    ];
    expect(reconExport(odd, "wildcards")).toBe("");
    expect(reconExport(odd, "hosts")).toBe("");
  });

  it("offers every format in the menu", () => {
    expect(RECON_FORMATS.map((format) => format.id)).toEqual([
      "plain",
      "json",
      "hosts",
      "wildcards",
      "urls",
      "cidr",
      "burp",
      "nuclei",
    ]);
  });
});
