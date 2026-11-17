import { useCallback, useState } from "react";
import type { z } from "zod";

const PREFIX = "scopedeck:";

function read<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/**
 * `useState` that survives restarts, for per-device view preferences such as the sidebar width
 * or a page's list/cards mode. Values are validated on read, so a stale or hand-edited entry
 * falls back to `initial` instead of breaking the page.
 *
 * @param key - Unique name for the preference.
 * @param schema - Validates the stored value.
 * @param initial - Used when nothing valid is stored.
 * @example
 * const [mode, setMode] = usePersistedState("programs.mode", z.enum(["list", "cards"]), "list");
 */
export function usePersistedState<T>(
  key: string,
  schema: z.ZodType<T>,
  initial: T,
): [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, schema, initial));
  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? (next as (current: T) => T)(current) : next;
        try {
          window.localStorage.setItem(PREFIX + key, JSON.stringify(resolved));
        } catch {
          // NOTE: Storage can be unavailable or full; the preference then lasts for this session only.
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}
