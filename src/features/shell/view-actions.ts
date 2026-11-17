import { useEffect } from "react";

type ViewAction = "refresh" | "search";

const handlers = new Map<ViewAction, () => void>();

export function runViewAction(action: ViewAction): boolean {
  const handler = handlers.get(action);
  handler?.();
  return handler !== undefined;
}

/** Lets the focused page answer global shortcuts such as R (sync) and / (search). */
export function useViewAction(action: ViewAction, handler: () => void): void {
  useEffect(() => {
    handlers.set(action, handler);
    return () => {
      if (handlers.get(action) === handler) handlers.delete(action);
    };
  }, [action, handler]);
}
