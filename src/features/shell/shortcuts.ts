import { useEffect, useRef } from "react";

export type ShortcutAction =
  | "palette"
  | "help"
  | "goPrograms"
  | "goReports"
  | "goIntents"
  | "goHacktivity"
  | "goEarnings"
  | "goSettings"
  | "compose"
  | "search"
  | "refresh"
  | "toggleSidebar";

export interface ShortcutDefinition {
  action: ShortcutAction;
  keys: string[];
  label: string;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD_LABEL = isMac ? "⌘" : "Ctrl";

export const SHORTCUTS: ShortcutDefinition[] = [
  { action: "palette", keys: [MOD_LABEL, "K"], label: "Open the command palette" },
  { action: "toggleSidebar", keys: [MOD_LABEL, "B"], label: "Show or hide the sidebar" },
  { action: "help", keys: ["?"], label: "Show keyboard shortcuts" },
  { action: "search", keys: ["/"], label: "Focus the search field" },
  { action: "refresh", keys: ["R"], label: "Sync the current view" },
  { action: "compose", keys: ["C"], label: "Write a new report" },
  { action: "goPrograms", keys: ["G", "P"], label: "Go to programs" },
  { action: "goReports", keys: ["G", "R"], label: "Go to reports" },
  { action: "goIntents", keys: ["G", "I"], label: "Go to report intents" },
  { action: "goHacktivity", keys: ["G", "H"], label: "Go to hacktivity" },
  { action: "goEarnings", keys: ["G", "E"], label: "Go to earnings" },
  { action: "goSettings", keys: [MOD_LABEL, ","], label: "Open settings" },
];

export const LIST_SHORTCUTS = [
  { keys: ["J"], label: "Next row" },
  { keys: ["K"], label: "Previous row" },
  { keys: ["Enter"], label: "Open the selected row" },
  { keys: [MOD_LABEL, "Enter"], label: "Review and submit, in the composer" },
];

const SEQUENCES: Record<string, ShortcutAction> = {
  p: "goPrograms",
  r: "goReports",
  i: "goIntents",
  h: "goHacktivity",
  e: "goEarnings",
};

const SINGLE: Record<string, ShortcutAction> = {
  "?": "help",
  "/": "search",
  r: "refresh",
  c: "compose",
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.closest(".cm-editor") !== null
  );
}

export function useGlobalShortcuts(onAction: (action: ShortcutAction) => void): void {
  const handlerRef = useRef(onAction);
  useEffect(() => {
    handlerRef.current = onAction;
  });

  useEffect(() => {
    let pendingG = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const fire = (action: ShortcutAction) => {
        event.preventDefault();
        handlerRef.current(action);
      };
      if (mod && event.key.toLowerCase() === "k") {
        fire("palette");
        return;
      }
      if (mod && event.key.toLowerCase() === "b") {
        fire("toggleSidebar");
        return;
      }
      if (mod && event.key === ",") {
        fire("goSettings");
        return;
      }
      if (mod || event.altKey || isTyping(event.target)) return;

      const key = event.key.toLowerCase();
      if (pendingG && Date.now() - pendingG < 1200) {
        pendingG = 0;
        const sequence = SEQUENCES[key];
        if (sequence) fire(sequence);
        return;
      }
      if (key === "g") {
        pendingG = Date.now();
        return;
      }
      const single = SINGLE[event.key] ?? SINGLE[key];
      if (single) fire(single);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
