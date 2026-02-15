import { useThemeMode } from "./ThemeProvider";
import { type ThemeMode } from "@/lib/theme-preferences";

export function ThemeModeToggle() {
  const { mode, effectiveTheme, setMode } = useThemeMode();
  const systemLabel = effectiveTheme === "dark" ? "Dark" : "Light";

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
      <span className="hidden sm:inline">Theme</span>
      <select
        aria-label="Theme"
        value={mode}
        onChange={(event) => setMode(event.target.value as ThemeMode)}
        className="h-8 rounded-md border border-border bg-background px-2 text-foreground text-xs sm:text-sm"
      >
        <option value="auto">Auto (System: {systemLabel})</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
