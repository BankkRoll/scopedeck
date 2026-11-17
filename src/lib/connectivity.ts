import { useSyncExternalStore } from "react";

interface Connectivity {
  browserOnline: boolean;
  apiReachable: boolean;
}

let state: Connectivity = {
  browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  apiReachable: true,
};
const listeners = new Set<() => void>();

function publish(next: Partial<Connectivity>) {
  const merged = { ...state, ...next };
  if (merged.browserOnline === state.browserOnline && merged.apiReachable === state.apiReachable) return;
  state = merged;
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    publish({ browserOnline: true });
  });
  window.addEventListener("offline", () => {
    publish({ browserOnline: false });
  });
}

export function reportApiReachable(reachable: boolean): void {
  publish({ apiReachable: reachable });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): boolean {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  return snapshot.browserOnline && snapshot.apiReachable;
}
