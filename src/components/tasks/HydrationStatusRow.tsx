import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface HydrationStatusRowProps {
  className?: string;
}

export function HydrationStatusRow({ className }: HydrationStatusRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-4 py-1.5 text-xs text-muted-foreground bg-muted/40 border-b border-border",
        className
      )}
    >
      <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
      <span>{t("feed.hydrating")}</span>
    </div>
  );
}
