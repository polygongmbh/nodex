import { cn } from "@/lib/utils";
import { MobileViewType } from "./MobileNav";
import { useTranslation } from "react-i18next";

interface SwipeIndicatorProps {
  views: MobileViewType[];
  currentView: MobileViewType;
  showFilters?: boolean;
}

export function SwipeIndicator({ views, currentView, showFilters = false }: SwipeIndicatorProps) {
  const { t } = useTranslation("shell");
  const currentIndex = showFilters ? -1 : views.indexOf(currentView);

  return (
    <div
      className="flex items-center justify-center gap-1.5 py-1"
      role="status"
      title={t("navigation.mobile.currentViewPosition")}
    >
      {/* Management dot */}
      <div
        className={cn(
          "h-1 rounded-full transition-all duration-200",
          showFilters
            ? "w-3.5 bg-primary"
            : "w-1 bg-muted-foreground/30"
        )}
      />

      {/* View dots */}
      {views.map((view, index) => (
        <div
          key={view}
          className={cn(
            "h-1 rounded-full transition-all duration-200",
            !showFilters && currentIndex === index
              ? "w-3.5 bg-primary"
              : "w-1 bg-muted-foreground/30"
          )}
        />
      ))}
    </div>
  );
}
