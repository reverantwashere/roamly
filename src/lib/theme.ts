export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export const THEME_STORAGE_KEY = "roamly-theme";

export function themePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export function readThemePreference(): ThemePreference {
  try { return themePreference(window.localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { return "system"; }
}
