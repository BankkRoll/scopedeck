import type { StructuredScope } from "@/ipc/programs";

export function submittableScopes<T extends StructuredScope>(scopes: readonly T[]): T[] {
  return scopes.filter((scope) => scope.eligibleForSubmission);
}

export interface ScopeGroup<T extends StructuredScope> {
  assetType: string;
  scopes: T[];
}

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

export type AssetMatch<T extends StructuredScope> =
  { kind: "eligible"; scope: T } | { kind: "ineligible"; scope: T } | { kind: "none" };

export function matchAsset<T extends StructuredScope>(scopes: readonly T[], asset: string): AssetMatch<T> {
  const matches = scopes.filter((scope) => scopeMatchesAsset(scope, asset));
  const exact = (scope: T) => scope.assetIdentifier.trim().toLowerCase() === asset.trim().toLowerCase();
  const eligible = matches.filter((scope) => scope.eligibleForSubmission);
  const best = eligible.find(exact) ?? eligible[0];
  if (best) return { kind: "eligible", scope: best };
  const blocked = matches.find(exact) ?? matches[0];
  return blocked ? { kind: "ineligible", scope: blocked } : { kind: "none" };
}

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
