const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  const date = parse(iso);
  if (!date) return "never";
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/**
 * The time between two timestamps as a short span, such as "45 min", "6 h" or "3 days". Empty
 * when either side is missing or the end comes before the start.
 *
 * @example formatDuration("2026-01-01T00:00:00Z", "2026-01-03T12:00:00Z") // "2.5 days"
 */
export function formatDuration(fromIso: string | null | undefined, toIso: string | null | undefined): string {
  const from = parse(fromIso);
  const to = parse(toIso);
  if (!from || !to) return "";
  const minutes = (to.getTime() - from.getTime()) / 60_000;
  if (minutes < 0) return "";
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = hours / 24;
  const rounded = days < 10 ? Math.round(days * 2) / 2 : Math.round(days);
  return `${rounded} days`;
}

export function formatDate(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? dateFormat.format(date) : "";
}

export function formatDateTime(iso: string | null | undefined): string {
  const date = parse(iso);
  return date ? dateTimeFormat.format(date) : "";
}

export function formatMoney(amount: number, currency = "USD"): string {
  const code = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const spaced = value.replace(/[-_]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  URL: "URL",
  WILDCARD: "Wildcard",
  API: "API",
  CIDR: "CIDR",
  IP_ADDRESS: "IP address",
  DOMAIN: "Domain",
  GOOGLE_PLAY_APP_ID: "Android app",
  APPLE_STORE_APP_ID: "iOS app",
  OTHER_APK: "Android APK",
  OTHER_IPA: "iOS IPA",
  TESTFLIGHT: "TestFlight",
  WINDOWS_APP_STORE_APP_ID: "Windows app",
  DOWNLOADABLE_EXECUTABLES: "Executable",
  SOURCE_CODE: "Source code",
  SMART_CONTRACT: "Smart contract",
  HARDWARE: "Hardware",
  AI_MODEL: "AI model",
  OTHER: "Other",
};

/**
 * Display name for an API asset type such as `GOOGLE_PLAY_APP_ID`.
 *
 * @example assetTypeLabel("WILDCARD") // "Wildcard"
 */
export function assetTypeLabel(assetType: string): string {
  return ASSET_TYPE_LABELS[assetType.toUpperCase()] ?? humanize(assetType.toLowerCase());
}
