import { useEffect } from "react";
import { useSettings } from "./use-settings";

export function useApplyTheme(): void {
  const { settings } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme !== "system") {
      root.dataset.theme = settings.theme;
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      root.dataset.theme = media.matches ? "light" : "dark";
    };
    apply();
    media.addEventListener("change", apply);
    return () => {
      media.removeEventListener("change", apply);
    };
  }, [settings.theme]);
}
