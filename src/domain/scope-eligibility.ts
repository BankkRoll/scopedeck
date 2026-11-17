/**
 * Scope eligibility and export: which assets accept submissions, how a finding's asset maps
 * onto a program's structured scope, and how scope is exported for recon tooling.
 */
import type { StructuredScope } from "@/ipc/programs";

/** Keeps only the assets that currently accept report submissions. */
export function submittableScopes<T extends StructuredScope>(scopes: readonly T[]): T[] {
  return scopes.filter((scope) => scope.eligibleForSubmission);
}

/** Scope assets sharing one asset type, as rendered by the scope panel. */
export interface ScopeGroup<T extends StructuredScope> {
  assetType: string;
  scopes: T[];
}

/**
 * Groups assets by upper-cased asset type, sorted by type, with eligible assets first inside
 * each group.
 */
export function groupByAssetType<T extends StructuredScope>(scopes: readonly T[]): ScopeGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const scope of scopes) {
    const key = scope.assetType.toUpperCase();
    groups.set(key, [...(groups.get(key) ?? []), scope]);
  }
  return [...groups.entries()]
    .map(([assetType, grouped]) => ({
      assetType,
      scopes: grouped.toSorted(
        (a, b) =>
          Number(b.eligibleForSubmission) - Number(a.eligibleForSubmission) ||
          a.assetIdentifier.localeCompare(b.assetIdentifier),
      ),
    }))
    .sort((a, b) => a.assetType.localeCompare(b.assetType));
}

/**
 * The lower-cased hostname of a URL or bare host, or the trimmed input when it does not parse.
 *
 * @example hostOf("https://API.acme.com/v2") // "api.acme.com"
 */
export function hostOf(asset: string): string {
  const trimmed = asset.trim().toLowerCase();
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname;
  } catch {
    return trimmed;
  }
}

/**
 * Matches a finding's asset (a host, URL or raw identifier) against a scope identifier.
 * Wildcards like `*.example.com` cover subdomains but not the apex, mirroring how programs
 * write them; any other identifier must match exactly, case-insensitively.
 */
export function scopeMatchesAsset(scope: StructuredScope, asset: string): boolean {
  const identifier = scope.assetIdentifier.trim().toLowerCase();
  const candidate = asset.trim().toLowerCase();
  if (!identifier || !candidate) return false;
  if (identifier === candidate) return true;
  const host = hostOf(candidate);
  if (identifier.startsWith("*.")) {
    const base = identifier.slice(2);
    return host.endsWith(`.${base}`);
  }
  return hostOf(identifier) === host && host.length > 0 && /[.:]/.test(host);
}

/** Outcome of {@link matchAsset}: the best covering scope and whether it accepts submissions. */
export type AssetMatch<T extends StructuredScope> =
  { kind: "eligible"; scope: T } | { kind: "ineligible"; scope: T } | { kind: "none" };

/**
 * Finds the scope that best covers an asset, preferring eligible scopes and exact identifiers
 * over covering wildcards.
 */
export function matchAsset<T extends StructuredScope>(scopes: readonly T[], asset: string): AssetMatch<T> {
  const matches = scopes.filter((scope) => scopeMatchesAsset(scope, asset));
  const exact = (scope: T) => scope.assetIdentifier.trim().toLowerCase() === asset.trim().toLowerCase();
  const eligible = matches.filter((scope) => scope.eligibleForSubmission);
  const best = eligible.find(exact) ?? eligible[0];
  if (best) return { kind: "eligible", scope: best };
  const blocked = matches.find(exact) ?? matches[0];
  return blocked ? { kind: "ineligible", scope: blocked } : { kind: "none" };
}

/** Exports scopes as one identifier per line, or as snake_case JSON mirroring the HackerOne API. */
export function scopeExport(scopes: readonly StructuredScope[], format: "plain" | "json"): string {
  if (format === "plain") return scopes.map((scope) => scope.assetIdentifier).join("\n");
  return JSON.stringify(
    scopes.map((scope) => ({
      asset_identifier: scope.assetIdentifier,
      asset_type: scope.assetType,
      eligible_for_bounty: scope.eligibleForBounty,
      eligible_for_submission: scope.eligibleForSubmission,
      max_severity: scope.maxSeverity,
      instruction: scope.instruction,
    })),
    null,
    2,
  );
}

// -----------------------------------------------------------------------------
// Recon export
// -----------------------------------------------------------------------------

/** One export format offered by the scope panel. */
export interface ReconFormatInfo {
  id: string;
  /** Sentence-case menu label. */
  label: string;
  /** The tool or use the format is shaped for, shown as menu meta text. */
  hint: string;
  /** File extension used by "Save as file". */
  extension: "txt" | "json";
}

/** Every export format, in menu order. */
export const RECON_FORMATS = [
  { id: "plain", label: "Asset list", hint: "As listed", extension: "txt" },
  { id: "json", label: "JSON", hint: "Full detail", extension: "json" },
  { id: "hosts", label: "Hosts", hint: "Hostnames", extension: "txt" },
  { id: "wildcards", label: "Wildcards", hint: "subfinder", extension: "txt" },
  { id: "urls", label: "URLs", hint: "httpx", extension: "txt" },
  { id: "cidr", label: "CIDR and IPs", hint: "Networks", extension: "txt" },
  { id: "burp", label: "Burp scope", hint: "Project options", extension: "json" },
  { id: "nuclei", label: "Nuclei targets", hint: "nuclei -l", extension: "txt" },
] as const satisfies readonly ReconFormatInfo[];

/** Identifier of a {@link RECON_FORMATS} entry. */
export type ReconFormat = (typeof RECON_FORMATS)[number]["id"];

interface AddressTarget {
  kind: "host" | "ip";
  host: string;
  /** Normalised URL, or `null` for bare network assets such as an `IP_ADDRESS` entry. */
  url: string | null;
  scheme: string | null;
  port: string | null;
  path: string;
}

type Target =
  AddressTarget | { kind: "wildcard"; pattern: string; apex: string } | { kind: "range"; value: string };

const WEB_TYPES = new Set(["URL", "WILDCARD", "DOMAIN", "API"]);
const NETWORK_TYPES = new Set(["CIDR", "IP_ADDRESS"]);
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{0,62}$/;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6_RE = /^[0-9a-f]*:[0-9a-f:.]*:[0-9a-f.]*$/;
const CIDR_RE = /^[0-9a-f:.]+\/\d{1,3}$/i;

function isIp(value: string): boolean {
  return IPV4_RE.test(value) || IPV6_RE.test(value);
}

function parseNetwork(token: string): Target {
  const value = token.toLowerCase();
  return isIp(value)
    ? { kind: "ip", host: value, url: null, scheme: null, port: null, path: "" }
    : { kind: "range", value };
}

/**
 * Parses one web identifier (`*.acme.com`, `https://acme.com:8443/api`, `10.0.0.1`) into a target.
 * Hosts and schemes are lower-cased but paths keep their case, since servers treat them as
 * case-sensitive. Returns `null` for identifiers that are not network-addressable.
 */
function parseWeb(token: string): Target | null {
  if (CIDR_RE.test(token)) return parseNetwork(token);
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(token);
  const scheme = schemeMatch?.[1]?.toLowerCase() ?? null;
  const rest = schemeMatch ? token.slice(schemeMatch[0].length) : token;
  const rawAuthority = /^[^/?#]*/.exec(rest)?.[0] ?? "";
  const suffix = rest.slice(rawAuthority.length);
  const authority = rawAuthority.replace(/^[^@]*@/, "").toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(authority);
  const withPort = bracketed ? null : /^(.*):(\d+)$/.exec(authority);
  const host = bracketed?.[1] ?? withPort?.[1] ?? authority;
  const port = bracketed?.[2] ?? withPort?.[2] ?? null;
  if (!host) return null;

  if (host.includes("*")) {
    const apex = host.slice(host.lastIndexOf("*") + 1).replace(/^\.+/, "");
    return HOST_RE.test(apex) ? { kind: "wildcard", pattern: host, apex } : null;
  }
  const kind = isIp(host) ? "ip" : HOST_RE.test(host) ? "host" : null;
  if (!kind) return null;
  const path = suffix === "/" ? "" : suffix;
  return { kind, host, scheme, port, path, url: `${scheme ?? "https"}://${authority}${path}` };
}

function targetsOf(scope: StructuredScope): Target[] {
  const type = scope.assetType.toUpperCase();
  const web = WEB_TYPES.has(type);
  if (!web && !NETWORK_TYPES.has(type)) return [];
  // NOTE: Programs often pack several assets into one identifier ("acme.com, www.acme.com").
  return scope.assetIdentifier
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap((token) => {
      const target = web ? parseWeb(token) : parseNetwork(token);
      return target ? [target] : [];
    });
}

function uniqueSorted(values: readonly string[]): string {
  return [...new Set(values)].sort().join("\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A Burp Suite advanced-mode scope rule; every field except `enabled` is a regex. */
interface BurpRule {
  enabled: boolean;
  file: string;
  host: string;
  port: string;
  protocol: string;
}

function burpRule(target: Target): BurpRule | null {
  if (target.kind === "range") return null;
  if (target.kind === "wildcard") {
    const host = `^${target.pattern.split("*").map(escapeRegex).join(".*")}$`;
    return { enabled: true, file: "^/.*", host, port: "^(80|443)$", protocol: "any" };
  }
  return {
    enabled: true,
    file: target.path.startsWith("/") ? `^${escapeRegex(target.path)}.*` : "^/.*",
    host: `^${escapeRegex(target.host)}$`,
    port: target.port ? `^${target.port}$` : "^(80|443)$",
    protocol: target.scheme === "http" || target.scheme === "https" ? target.scheme : "any",
  };
}

function burpRules(scopes: readonly StructuredScope[]): BurpRule[] {
  const rules = scopes.flatMap(targetsOf).flatMap((target) => {
    const rule = burpRule(target);
    return rule ? [rule] : [];
  });
  return [...new Map(rules.map((rule) => [JSON.stringify(rule), rule])).values()];
}

/**
 * Exports scope in a format a recon tool can consume directly.
 *
 * `plain` and `json` export every given scope, eligible or not, exactly like {@link scopeExport}.
 * Tool formats only include assets that accept submissions, de-duplicated and sorted:
 * - `hosts`: hostnames; wildcards are reduced to their apex and URLs to their host.
 * - `wildcards`: the apex domain of each wildcard, ready for subfinder.
 * - `urls` / `nuclei`: web assets as URLs, `https://` when no scheme is given. Wildcards are
 *   left out because their apex is not necessarily in scope.
 * - `cidr`: IP addresses and ranges, including IP hosts written as URLs.
 * - `burp`: Burp Suite project options with an advanced-mode target scope. Ineligible assets
 *   become exclude rules, so an out-of-scope host under an in-scope wildcard stays excluded.
 *   CIDR ranges are omitted because Burp's host field is a regex.
 *
 * @param scopes - Assets to export, typically what the scope panel currently shows.
 * @param format - One of {@link RECON_FORMATS}.
 * @returns Text ready for the clipboard or a file; empty when nothing fits the format.
 * @example
 * reconExport([scope({ id: "1", assetIdentifier: "*.acme.com", assetType: "WILDCARD" })], "wildcards");
 * // "acme.com"
 */
export function reconExport(scopes: readonly StructuredScope[], format: ReconFormat): string {
  if (format === "plain" || format === "json") return scopeExport(scopes, format);
  if (format === "burp") {
    const include = burpRules(submittableScopes(scopes));
    if (include.length === 0) return "";
    return JSON.stringify(
      {
        target: {
          scope: {
            advanced_mode: true,
            include,
            exclude: burpRules(scopes.filter((scope) => !scope.eligibleForSubmission)),
          },
        },
      },
      null,
      2,
    );
  }
  const targets = submittableScopes(scopes).flatMap(targetsOf);
  switch (format) {
    case "hosts":
      return uniqueSorted(
        targets.flatMap((target) =>
          target.kind === "host" ? [target.host] : target.kind === "wildcard" ? [target.apex] : [],
        ),
      );
    case "wildcards":
      return uniqueSorted(targets.flatMap((target) => (target.kind === "wildcard" ? [target.apex] : [])));
    case "urls":
    case "nuclei":
      return uniqueSorted(
        targets.flatMap((target) =>
          (target.kind === "host" || target.kind === "ip") && target.url ? [target.url] : [],
        ),
      );
    case "cidr":
      return uniqueSorted(
        targets.flatMap((target) =>
          target.kind === "ip" ? [target.host] : target.kind === "range" ? [target.value] : [],
        ),
      );
  }
}
