import type { Severity } from "@/ipc/reports";
import { formatVector, parseVector } from "./cvss";

const LETTER: Record<string, string> = {
  network: "N",
  adjacent: "A",
  adjacent_network: "A",
  local: "L",
  physical: "P",
  none: "N",
  low: "L",
  high: "H",
  required: "R",
  unchanged: "U",
  changed: "C",
};

function letter(value: string | null): string | null {
  if (!value) return null;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return LETTER[key] ?? null;
}

/**
 * The CVSS 3.1 vector for a report severity, built from the per-metric values the API returns
 * (such as `attack_vector: "network"`), or null when any base metric is missing.
 *
 * @example severityVector(report.severity) // "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
 */
export function severityVector(severity: Severity | null | undefined): string | null {
  if (!severity) return null;
  const parts = [
    ["AV", severity.attackVector],
    ["AC", severity.attackComplexity],
    ["PR", severity.privilegesRequired],
    ["UI", severity.userInteraction],
    ["S", severity.scope],
    ["C", severity.confidentiality],
    ["I", severity.integrity],
    ["A", severity.availability],
  ] as const;
  const letters = parts.map(([key, value]) => [key, letter(value)] as const);
  if (letters.some(([, value]) => value === null)) return null;
  const metrics = parseVector(`CVSS:3.1/${letters.map(([key, value]) => `${key}:${value ?? ""}`).join("/")}`);
  return metrics ? formatVector(metrics) : null;
}
