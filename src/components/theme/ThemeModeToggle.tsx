import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "./ThemeProvider";
import { type ThemeMode } from "@/lib/theme-preferences";
import { cn } from "@/lib/utils";

const THEME_ORDER: ThemeMode[] = ["auto", "light", "dark"];

interface ThemeModeToggleProps {
  className?: string;
}

export function ThemeModeToggle({ className }: ThemeModeToggleProps) {
  const { mode, setMode } = useThemeMode();
  const currentIndex = THEME_ORDER.indexOf(mode);
  const nextMode = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];

  const icon = mode === "auto" ? (
    <span className="relative inline-flex">
      <SunMoon className="h-4 w-4 xl:h-5 xl:w-5" />
      <span className="absolute -right-1 -bottom-1 rounded-sm bg-primary px-[2px] text-[8px] leading-none font-semibold text-primary-foreground">
        A
      </span>
    </span>
  ) : mode === "light" ? (
    <Sun className="h-4 w-4 xl:h-5 xl:w-5" />
  ) : (
    <Moon className="h-4 w-4 xl:h-5 xl:w-5" />
  );
  const label = mode === "auto" ? "Auto theme" : mode === "light" ? "Light theme" : "Dark theme";
  const nextLabel = nextMode === "auto" ? "auto" : nextMode === "light" ? "light" : "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9 hover:bg-accent/60 hover:text-accent-foreground xl:h-10 xl:w-10", className)}
      onClick={() => setMode(nextMode)}
      aria-label={`${label}. Switch to ${nextLabel}.`}
      title={`${label} (click to switch to ${nextLabel})`}
    >
      {icon}
    </Button>
  );
}
