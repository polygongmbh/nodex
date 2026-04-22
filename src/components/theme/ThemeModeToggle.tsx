import { Moon, Sun, SunMoon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useThemeMode } from "./ThemeProvider";
import { type ThemeMode } from "@/infrastructure/preferences/theme-preferences-storage";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const THEME_ORDER: ThemeMode[] = ["auto", "light", "dark"];

interface ThemeModeToggleProps {
  className?: string;
}

export function ThemeModeToggle({ className }: ThemeModeToggleProps) {
  const { t } = useTranslation("shell");
  const { mode, setMode } = useThemeMode();
  const currentIndex = THEME_ORDER.indexOf(mode);
  const nextMode = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];

  const icon = mode === "auto" ? (
    <span className="relative inline-flex">
      <SunMoon className="h-4 w-4 xl:h-5 xl:w-5" />
      <span className="absolute -right-1 -bottom-1 rounded-sm bg-primary px-[0.125rem] text-[0.5rem] leading-none font-semibold text-primary-foreground">
        A
      </span>
    </span>
  ) : mode === "light" ? (
    <Sun className="h-4 w-4 xl:h-5 xl:w-5" />
  ) : (
    <Moon className="h-4 w-4 xl:h-5 xl:w-5" />
  );
  const label = t(`theme.mode.${mode}`);
  const nextLabel = t(`theme.mode.${nextMode}`);
  const switchLabel = t("theme.switchTo", { mode: nextLabel });

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-9 w-9 hover:bg-muted hover:text-foreground xl:h-10 xl:w-10", className)}
      onClick={() => setMode(nextMode)}
      aria-label={`${label}. ${switchLabel}`}
      title={`${label} (${switchLabel})`}
    >
      {icon}
    </Button>
  );
}
