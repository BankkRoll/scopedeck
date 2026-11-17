import { z } from "zod";
import { severityRatingSchema } from "@/ipc/common";
import { hacktivitySortSchema } from "@/ipc/hacktivity";

export const ASSET_TYPES = [
  "URL",
  "WILDCARD",
  "API",
  "CIDR",
  "IP_ADDRESS",
  "DOMAIN",
  "GOOGLE_PLAY_APP_ID",
  "APPLE_STORE_APP_ID",
  "OTHER_APK",
  "OTHER_IPA",
  "TESTFLIGHT",
  "WINDOWS_APP_STORE_APP_ID",
  "DOWNLOADABLE_EXECUTABLES",
  "SOURCE_CODE",
  "SMART_CONTRACT",
  "HARDWARE",
  "AI_MODEL",
  "OTHER",
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

export const filtersSchema = z.object({
  severities: z.array(severityRatingSchema),
  assetTypes: z.array(z.string()),
  cwe: z.string(),
  cve: z.string(),
  program: z.string(),
  reporter: z.string(),
  minBounty: z.number().nonnegative().nullable(),
  maxBounty: z.number().nonnegative().nullable(),
  disclosedFrom: isoDate,
  disclosedTo: isoDate,
  collaboration: z.enum(["any", "yes", "no"]),
  disclosedOnly: z.boolean(),
});
export type HacktivityFilters = z.infer<typeof filtersSchema>;

export const builderStateSchema = z.object({
  mode: z.enum(["builder", "raw"]),
  filters: filtersSchema,
  raw: z.string(),
  sort: hacktivitySortSchema,
});
export type BuilderState = z.infer<typeof builderStateSchema>;

export const EMPTY_FILTERS: HacktivityFilters = {
  severities: [],
  assetTypes: [],
  cwe: "",
  cve: "",
  program: "",
  reporter: "",
  minBounty: null,
  maxBounty: null,
  disclosedFrom: null,
  disclosedTo: null,
  collaboration: "any",
  disclosedOnly: true,
};

export const DEFAULT_BUILDER_STATE: BuilderState = {
  mode: "builder",
  filters: EMPTY_FILTERS,
  raw: "",
  sort: "-latest_disclosable_activity_at",
};

const BARE_TOKEN = /^[A-Za-z0-9_.@-]+$/;
const LUCENE_RESERVED_WORDS = new Set(["AND", "OR", "NOT", "TO"]);

export function luceneValue(value: string): string {
  const trimmed = value.trim();
  if (
    BARE_TOKEN.test(trimmed) &&
    !LUCENE_RESERVED_WORDS.has(trimmed.toUpperCase()) &&
    !trimmed.startsWith("-")
  ) {
    return trimmed;
  }
  return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function anyOf(field: string, values: readonly string[]): string | null {
  const cleaned = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return `${field}:${luceneValue(cleaned[0] ?? "")}`;
  return `${field}:(${cleaned.map(luceneValue).join(" OR ")})`;
}

function listInput(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The Hacker API documents dates in queries as DD-MM-YYYY (`disclosed_at:>=01-01-1970`). */
export function apiDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day ?? ""}-${month ?? ""}-${year ?? ""}`;
}

function normaliseCwe(raw: string): string {
  const trimmed = raw.trim();
  const numeric = /^(?:cwe-?)?(\d+)$/i.exec(trimmed);
  return numeric ? `CWE-${numeric[1] ?? ""}` : trimmed;
}

export function compileQuery(filters: HacktivityFilters): string {
  const clauses: (string | null)[] = [
    filters.disclosedOnly ? "disclosed:true" : null,
    anyOf("severity_rating", filters.severities),
    anyOf("asset_type", filters.assetTypes),
    anyOf("cwe", filters.cwe.trim() ? [normaliseCwe(filters.cwe)] : []),
    anyOf(
      "cve_ids",
      listInput(filters.cve).map((cve) => cve.toUpperCase()),
    ),
    anyOf("team", listInput(filters.program)),
    anyOf("reporter", listInput(filters.reporter)),
    filters.minBounty !== null ? `total_awarded_amount:>=${filters.minBounty}` : null,
    filters.maxBounty !== null ? `total_awarded_amount:<=${filters.maxBounty}` : null,
    filters.disclosedFrom ? `disclosed_at:>=${apiDate(filters.disclosedFrom)}` : null,
    filters.disclosedTo ? `disclosed_at:<=${apiDate(filters.disclosedTo)}` : null,
    filters.collaboration === "any" ? null : `has_collaboration:${filters.collaboration === "yes"}`,
  ];
  return clauses.filter((clause): clause is string => clause !== null).join(" AND ");
}

export function queryStringFor(state: BuilderState): string {
  return state.mode === "raw" ? state.raw.trim() : compileQuery(state.filters);
}

export interface FilterProblem {
  field: keyof HacktivityFilters;
  message: string;
}

export function filterProblems(filters: HacktivityFilters): FilterProblem[] {
  const problems: FilterProblem[] = [];
  if (filters.minBounty !== null && filters.maxBounty !== null && filters.minBounty > filters.maxBounty) {
    problems.push({ field: "maxBounty", message: "The maximum bounty is below the minimum." });
  }
  if (filters.disclosedFrom && filters.disclosedTo && filters.disclosedFrom > filters.disclosedTo) {
    problems.push({ field: "disclosedTo", message: "The end date is before the start date." });
  }
  for (const cve of listInput(filters.cve)) {
    if (!/^CVE-\d{4}-\d{4,}$/i.test(cve)) {
      problems.push({ field: "cve", message: `${cve} is not a CVE identifier like CVE-2024-12345.` });
    }
  }
  return problems;
}
