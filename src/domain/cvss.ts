/**
 * CVSS v3.1 base score calculator, implemented to the FIRST specification
 * (https://www.first.org/cvss/v3.1/specification-document).
 *
 * Responsibilities:
 * - Describe the eight base metrics with their values, weights and labels.
 * - Parse and format vector strings (v3.0 and v3.1 prefixes are accepted).
 * - Compute the base score and map it to a qualitative severity rating.
 */
import type { SeverityRating } from "@/ipc/common";

/** Identifier of a CVSS v3.1 base metric. */
export type CvssMetricKey = "AV" | "AC" | "PR" | "UI" | "S" | "C" | "I" | "A";

/** A fully specified set of base metrics. Each value is the metric's single-letter abbreviation. */
export interface CvssMetrics {
  AV: "N" | "A" | "L" | "P";
  AC: "L" | "H";
  PR: "N" | "L" | "H";
  UI: "N" | "R";
  S: "U" | "C";
  C: "H" | "L" | "N";
  I: "H" | "L" | "N";
  A: "H" | "L" | "N";
}

/** One selectable value of a metric. */
export interface CvssMetricValue<V extends string = string> {
  /** Abbreviation used in the vector string. */
  value: V;
  label: string;
  description: string;
}

/** A base metric with its human-readable name and allowed values, in display order. */
export interface CvssMetricDefinition<K extends CvssMetricKey = CvssMetricKey> {
  key: K;
  label: string;
  description: string;
  values: readonly CvssMetricValue<CvssMetrics[K]>[];
}

type MetricDefinitions = { [K in CvssMetricKey]: CvssMetricDefinition<K> };

const impactValues = (subject: string) =>
  [
    { value: "H", label: "High", description: `Total loss of ${subject}, or a serious partial loss.` },
    { value: "L", label: "Low", description: `Some loss of ${subject}, limited in extent or control.` },
    { value: "N", label: "None", description: `No loss of ${subject}.` },
  ] as const;

/** Definitions of the eight base metrics, keyed by abbreviation. */
export const CVSS_METRICS: MetricDefinitions = {
  AV: {
    key: "AV",
    label: "Attack vector",
    description: "How remote the attacker can be.",
    values: [
      { value: "N", label: "Network", description: "Exploitable remotely, across the internet." },
      {
        value: "A",
        label: "Adjacent",
        description: "Requires a shared network segment, such as the same LAN.",
      },
      { value: "L", label: "Local", description: "Requires local access or user interaction to run code." },
      { value: "P", label: "Physical", description: "Requires physically touching the device." },
    ],
  },
  AC: {
    key: "AC",
    label: "Attack complexity",
    description: "Conditions beyond the attacker's control that must exist.",
    values: [
      { value: "L", label: "Low", description: "No special conditions; repeatable success." },
      { value: "H", label: "High", description: "Depends on conditions such as a race or gathered secrets." },
    ],
  },
  PR: {
    key: "PR",
    label: "Privileges required",
    description: "Privileges the attacker needs before exploiting.",
    values: [
      { value: "N", label: "None", description: "Unauthenticated." },
      { value: "L", label: "Low", description: "A basic user account." },
      { value: "H", label: "High", description: "Administrative or otherwise significant privileges." },
    ],
  },
  UI: {
    key: "UI",
    label: "User interaction",
    description: "Whether another user must take part.",
    values: [
      { value: "N", label: "None", description: "No victim action needed." },
      { value: "R", label: "Required", description: "A victim must act, such as clicking a link." },
    ],
  },
  S: {
    key: "S",
    label: "Scope",
    description: "Whether impact reaches beyond the vulnerable component.",
    values: [
      { value: "U", label: "Unchanged", description: "Impact stays within the vulnerable component." },
      {
        value: "C",
        label: "Changed",
        description: "Impact crosses a security boundary to other components.",
      },
    ],
  },
  C: {
    key: "C",
    label: "Confidentiality",
    description: "Impact on information disclosure.",
    values: impactValues("confidentiality"),
  },
  I: {
    key: "I",
    label: "Integrity",
    description: "Impact on trustworthiness of data.",
    values: impactValues("integrity"),
  },
  A: {
    key: "A",
    label: "Availability",
    description: "Impact on access to the component.",
    values: impactValues("availability"),
  },
};

/** Metric keys in the order the specification writes them in a vector. */
export const CVSS_METRIC_ORDER: readonly CvssMetricKey[] = ["AV", "AC", "PR", "UI", "S", "C", "I", "A"];

const AV_WEIGHT: Record<CvssMetrics["AV"], number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_WEIGHT: Record<CvssMetrics["AC"], number> = { L: 0.77, H: 0.44 };
const UI_WEIGHT: Record<CvssMetrics["UI"], number> = { N: 0.85, R: 0.62 };
const CIA_WEIGHT: Record<CvssMetrics["C"], number> = { H: 0.56, L: 0.22, N: 0 };

function privilegesWeight(pr: CvssMetrics["PR"], scope: CvssMetrics["S"]): number {
  if (pr === "N") return 0.85;
  if (pr === "L") return scope === "C" ? 0.68 : 0.62;
  return scope === "C" ? 0.5 : 0.27;
}

// Temporal and environmental metrics may appear in pasted vectors. They do not affect the
// base score, so they are accepted and dropped rather than rejecting the whole vector.
const NON_BASE_KEYS = new Set([
  "E",
  "RL",
  "RC",
  "CR",
  "IR",
  "AR",
  "MAV",
  "MAC",
  "MPR",
  "MUI",
  "MS",
  "MC",
  "MI",
  "MA",
]);

function isMetricKey(key: string): key is CvssMetricKey {
  return (CVSS_METRIC_ORDER as readonly string[]).includes(key);
}

/**
 * Parses a CVSS v3.x vector string into base metrics.
 *
 * Accepts `CVSS:3.1/` and `CVSS:3.0/` prefixes, or a bare metric list. Every base metric must
 * appear exactly once; temporal and environmental metrics are ignored.
 *
 * @param vector - The vector string, for example `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`.
 * @returns The parsed metrics, or `null` when the vector is malformed or incomplete.
 * @example
 * parseVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")?.AV; // "N"
 */
export function parseVector(vector: string): CvssMetrics | null {
  const parts = vector.trim().split("/");
  if (parts[0]?.startsWith("CVSS:")) {
    if (parts[0] !== "CVSS:3.1" && parts[0] !== "CVSS:3.0") return null;
    parts.shift();
  }

  const found: Partial<Record<CvssMetricKey, string>> = {};
  for (const part of parts) {
    const [key, value, ...rest] = part.split(":");
    if (key === undefined || value === undefined || rest.length > 0) return null;
    if (NON_BASE_KEYS.has(key)) continue;
    if (!isMetricKey(key) || found[key] !== undefined) return null;
    if (!CVSS_METRICS[key].values.some((option) => option.value === value)) return null;
    found[key] = value;
  }

  const { AV, AC, PR, UI, S, C, I, A } = found;
  if (!AV || !AC || !PR || !UI || !S || !C || !I || !A) return null;
  // Every value was checked against its metric's definition above, so these narrowings are sound.
  return { AV, AC, PR, UI, S, C, I, A } as CvssMetrics;
}

/**
 * Formats base metrics as a CVSS v3.1 vector string.
 *
 * @example
 * formatVector({ AV: "N", AC: "L", PR: "N", UI: "N", S: "U", C: "H", I: "H", A: "H" });
 * // "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
 */
export function formatVector(metrics: CvssMetrics): string {
  return ["CVSS:3.1", ...CVSS_METRIC_ORDER.map((key) => `${key}:${metrics[key]}`)].join("/");
}

/**
 * The Roundup function from Appendix A of the v3.1 specification: the smallest number, to one
 * decimal place, that is equal to or higher than its input. It works on integers to avoid
 * floating-point artefacts such as `Math.ceil(4.0000001 * 10)` yielding 4.1.
 */
export function roundUp(input: number): number {
  const intInput = Math.round(input * 100000);
  if (intInput % 10000 === 0) return intInput / 100000;
  return (Math.floor(intInput / 10000) + 1) / 10;
}

/**
 * Computes the CVSS v3.1 base score.
 *
 * @returns A score from 0.0 to 10.0 with one decimal place.
 * @example
 * baseScore({ AV: "N", AC: "L", PR: "N", UI: "N", S: "U", C: "H", I: "H", A: "H" }); // 9.8
 */
export function baseScore(metrics: CvssMetrics): number {
  const scopeChanged = metrics.S === "C";
  const iss = 1 - (1 - CIA_WEIGHT[metrics.C]) * (1 - CIA_WEIGHT[metrics.I]) * (1 - CIA_WEIGHT[metrics.A]);
  const impact = scopeChanged ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const exploitability =
    8.22 *
    AV_WEIGHT[metrics.AV] *
    AC_WEIGHT[metrics.AC] *
    privilegesWeight(metrics.PR, metrics.S) *
    UI_WEIGHT[metrics.UI];

  if (impact <= 0) return 0;
  return scopeChanged
    ? roundUp(Math.min(1.08 * (impact + exploitability), 10))
    : roundUp(Math.min(impact + exploitability, 10));
}

/**
 * Maps a base score to the specification's qualitative severity rating.
 *
 * @example
 * severityFor(9.8); // "critical"
 */
export function severityFor(score: number): SeverityRating {
  if (score <= 0) return "none";
  if (score < 4) return "low";
  if (score < 7) return "medium";
  if (score < 9) return "high";
  return "critical";
}
