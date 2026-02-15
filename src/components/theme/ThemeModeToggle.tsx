import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "./ThemeProvider";
import { type ThemeMode } from "@/lib/theme-preferences";

const THEME_ORDER: ThemeMode[] = ["auto", "light", "dark"];

export function ThemeModeToggle() {
  const { mode, setMode } = useThemeMode();
  const currentIndex = THEME_ORDER.indexOf(mode);
  const nextMode = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];

  const icon = mode === "auto" ? (
    <span className="relative inline-flex">
      <SunMoon className="h-4 w-4" />
      <span className="absolute -right-1 -bottom-1 rounded-sm bg-primary px-[2px] text-[8px] leading-none font-semibold text-primary-foreground">
        A
      </span>
    </span>
  ) : mode === "light" ? (
    <Sun className="h-4 w-4" />
  ) : (
    <Moon className="h-4 w-4" />
  );
  const label = mode === "auto" ? "Auto theme" : mode === "light" ? "Light theme" : "Dark theme";
  const nextLabel = nextMode === "auto" ? "auto" : nextMode === "light" ? "light" : "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setMode(nextMode)}
      aria-label={`${label}. Switch to ${nextLabel}.`}
      title={`${label} (click to switch to ${nextLabel})`}
    >
      {icon}
    </Button>
  );
}
