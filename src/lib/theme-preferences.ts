export type ThemeMode = "light" | "dark" | "auto";
export type EffectiveTheme = "light" | "dark";

import { THEME_MODE_STORAGE_KEY } from "./storage-registry";
export { THEME_MODE_STORAGE_KEY };
const VALID_THEME_MODES: ThemeMode[] = ["light", "dark", "auto"];

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && VALID_THEME_MODES.includes(value as ThemeMode);
}

export function getStoredThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (isThemeMode(raw)) {
      return raw;
    }

    localStorage.setItem(THEME_MODE_STORAGE_KEY, "auto");
    return "auto";
  } catch {
    return "auto";
  }
}

export function setStoredThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors and keep runtime behavior functional.
  }
}

export function resolveEffectiveTheme(mode: ThemeMode, systemPrefersDark: boolean): EffectiveTheme {
  if (mode === "auto") {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}
