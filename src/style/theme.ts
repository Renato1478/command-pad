import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const THEME_KEY = "command-pad-theme";

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : "system";
  } catch {
    return "system";
  }
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        preference === "dark" || (preference === "system" && !!media?.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    media?.addEventListener("change", apply);
    try {
      localStorage.setItem(THEME_KEY, preference);
    } catch {
      // Keep the selected theme for this session if storage is unavailable.
    }
    return () => media?.removeEventListener("change", apply);
  }, [preference]);

  return { preference, setPreference };
}
