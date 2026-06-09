import { Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-version";

interface SidebarHeaderProps {
  className?: string;
}

export function SidebarHeader({ className }: SidebarHeaderProps) {
  const { t } = useTranslation("shell");
  const appVersionHint = `Nodex v${APP_VERSION || "0.0.0"}`;

  return (
    <div className={cn("w-44 lg:w-56 xl:w-64 overflow-hidden px-3 lg:px-4 border-b border-sidebar-border flex items-center flex-shrink-0", className)}>
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="w-8 h-8 xl:w-10 xl:h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
          <Radio className="w-4 h-4 xl:w-5 xl:h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <a
            href="/"
            title={appVersionHint}
            className="inline-flex items-center font-heading font-semibold text-foreground truncate text-sm xl:text-lg hover:text-primary transition-colors"
          >
            Nodex
          </a>
          <p className="text-xs text-muted-foreground truncate hidden lg:block">{t("sidebar.tagline")}</p>
        </div>
      </div>
    </div>
  );
}
