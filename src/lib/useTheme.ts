import { useEffect, useLayoutEffect, useState } from "react";
import { readThemePreference, resolveTheme, themePreference, THEME_STORAGE_KEY, type ThemePreference } from "./theme";

export function useTheme() {
  const [preference, setPreference] = useState(readThemePreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const resolved = resolveTheme(preference, systemDark);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#121b17" : "#f8f9f6");
  }, [resolved]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => setSystemDark(media.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setPreference(themePreference(event.newValue));
      }
    };
    onSystemChange();
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function chooseTheme(next: ThemePreference) {
    setPreference(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* The selection still works when browser storage is unavailable. */ }
  }

  return { preference, resolved, chooseTheme };
}
