import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getStoredThemeMode,
  resolveEffectiveTheme,
  setStoredThemeMode,
  type EffectiveTheme,
  type ThemeMode,
} from "@/lib/theme-preferences";

interface ThemeContextValue {
  mode: ThemeMode;
  effectiveTheme: EffectiveTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeContextValue | undefined>(undefined);

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getSystemPrefersDark() {
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
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
