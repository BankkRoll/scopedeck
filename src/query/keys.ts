import type { HacktivityQuery } from "@/ipc/hacktivity";
import type { SearchKind } from "@/ipc/programs";

export const queryKeys = {
  auth: ["auth"] as const,
  settings: ["settings"] as const,
  programs: {
    cached: ["programs", "cached"] as const,
    sync: ["programs", "sync"] as const,
  },
  program: {
    cached: (handle: string) => ["program", handle, "cached"] as const,
    sync: (handle: string) => ["program", handle, "sync"] as const,
  },
  search: (query: string, kinds: readonly SearchKind[]) => ["search", query, [...kinds].sort()] as const,
  reports: {
    cached: ["reports", "cached"] as const,
    sync: ["reports", "sync"] as const,
  },
  report: {
    cached: (id: string) => ["report", id, "cached"] as const,
    sync: (id: string) => ["report", id, "sync"] as const,
  },
  intents: ["intents"] as const,
  intent: (id: string) => ["intent", id] as const,
  hacktivity: (query: Omit<HacktivityQuery, "pageNumber">) => ["hacktivity", query] as const,
  earnings: {
    cached: ["earnings", "cached"] as const,
    sync: ["earnings", "sync"] as const,
  },
  drafts: ["drafts"] as const,
  draft: (id: string) => ["draft", id] as const,
  templates: ["templates"] as const,
  savedSearches: ["saved-searches"] as const,
  update: ["update"] as const,
};
