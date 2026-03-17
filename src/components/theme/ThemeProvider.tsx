import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getStoredThemeMode,
  resolveEffectiveTheme,
  setStoredThemeMode,
  type EffectiveTheme,
  type ThemeMode,
} from "@/infrastructure/preferences/theme-preferences-storage";

interface ThemeContextValue {
  mode: ThemeMode;
  effectiveTheme: EffectiveTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeContextValue | undefined>(undefined);

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";
const THEME_COLOR_META_SELECTOR = 'meta[name="theme-color"][data-nodex-theme-color]';

function getSystemPrefersDark() {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

function setThemeColorMeta(effectiveTheme: EffectiveTheme) {
  const head = document.head;
  if (!head) return;
  const root = document.documentElement;
  const backgroundHsl = getComputedStyle(root).getPropertyValue("--background").trim();
  const themeColor = backgroundHsl ? `hsl(${backgroundHsl})` : effectiveTheme === "dark" ? "hsl(220 20% 10%)" : "hsl(210 28% 98%)";

  let meta = document.querySelector(THEME_COLOR_META_SELECTOR);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("data-nodex-theme-color", "true");
    head.appendChild(meta);
  }

  meta.setAttribute("content", themeColor);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredThemeMode());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPrefersDark());

  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    media.addEventListener("change", handleChange);
    setSystemPrefersDark(media.matches);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const effectiveTheme = useMemo<EffectiveTheme>(
    () => resolveEffectiveTheme(mode, systemPrefersDark),
    [mode, systemPrefersDark]
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", effectiveTheme === "dark");
    root.style.colorScheme = effectiveTheme;
    setThemeColorMeta(effectiveTheme);
  }, [effectiveTheme]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    setStoredThemeMode(nextMode);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      effectiveTheme,
      setMode,
    }),
    [mode, effectiveTheme, setMode]
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within ThemeProvider");
  }
  return context;
}
