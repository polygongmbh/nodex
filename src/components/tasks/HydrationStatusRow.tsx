import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface HydrationStatusRowProps {
  className?: string;
}

export function HydrationStatusRow({ className }: HydrationStatusRowProps) {
  const { t } = useTranslation("tasks");

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full h-12 border-b border-border/80 bg-muted/60 px-2 sm:px-3 flex items-center gap-2 shadow-sm text-sm text-foreground/80",
        className
      )}
    >
      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
      <span className="leading-none font-medium text-foreground">{t("feed.hydrating")}</span>
    </div>
  );
}
