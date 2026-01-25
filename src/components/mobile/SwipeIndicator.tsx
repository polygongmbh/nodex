import { cn } from "@/lib/utils";
import { ViewType } from "@/components/tasks/ViewSwitcher";

interface SwipeIndicatorProps {
  views: ViewType[];
  currentView: ViewType;
  showFilters?: boolean;
}

export function SwipeIndicator({ views, currentView, showFilters = false }: SwipeIndicatorProps) {
  const currentIndex = showFilters ? -1 : views.indexOf(currentView);
  const totalDots = views.length + 1; // +1 for filters

  return (
    <div 
      className="flex items-center justify-center gap-1.5 py-2"
      role="tablist"
      aria-label="View position indicator"
    >
      {/* Filters dot */}
      <div
        className={cn(
          "w-1.5 h-1.5 rounded-full transition-all duration-200",
          showFilters 
            ? "w-4 bg-primary" 
            : "bg-muted-foreground/30"
        )}
        aria-selected={showFilters}
        aria-label="Filters"
      />
      
      {/* View dots */}
      {views.map((view, index) => (
        <div
          key={view}
          className={cn(
            "h-1.5 rounded-full transition-all duration-200",
            !showFilters && currentIndex === index
              ? "w-4 bg-primary" 
              : "w-1.5 bg-muted-foreground/30"
          )}
          aria-selected={!showFilters && currentIndex === index}
          aria-label={view}
        />
      ))}
    </div>
  );
}
