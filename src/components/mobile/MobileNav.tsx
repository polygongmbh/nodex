import { useRef, useCallback, useState, PointerEvent } from "react";
import { Filter, Rss, GitBranch, List, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useTranslation } from "react-i18next";

export type MobileViewType = ViewType | "filters";

interface MobileNavProps {
  currentView: MobileViewType;
  onViewChange: (view: MobileViewType) => void;
}

const allSegments: MobileViewType[] = ["filters", "feed", "tree", "list", "calendar"];

export function MobileNav({ currentView, onViewChange }: MobileNavProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [isPressed, setIsPressed] = useState(false);

  const segmentLabels: Partial<Record<MobileViewType, string>> = {
    filters: "",
    feed: t("navigation.views.feed"),
    tree: t("navigation.views.tree"),
    list: t("navigation.views.upcoming"),
    calendar: t("navigation.views.calendar"),
  };

  const activeIndex = allSegments.indexOf(currentView);

  const getSegmentFromX = useCallback((clientX: number): MobileViewType | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child.dataset.segmentIndex === undefined) continue;
      const childRect = child.getBoundingClientRect();
      if (clientX >= childRect.left && clientX <= childRect.right) {
        return allSegments[parseInt(child.dataset.segmentIndex)];
      }
    }
    if (x <= 0) return allSegments[0];
    return allSegments[allSegments.length - 1];
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    setIsPressed(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const seg = getSegmentFromX(e.clientX);
    if (seg && seg !== currentView) {
      onViewChange(seg);
    }
  }, [currentView, getSegmentFromX, onViewChange]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const seg = getSegmentFromX(e.clientX);
    if (seg && seg !== currentView) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(10);
      }
      onViewChange(seg);
    }
  }, [currentView, getSegmentFromX, onViewChange]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    setIsPressed(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false;
    setIsPressed(false);
  }, []);

  const segmentCount = allSegments.length;

  return (
    <nav
      className="mx-2 mt-2 mb-1 safe-area-top"
      role="tablist"
      aria-label={t("navigation.aria.views")}
      data-onboarding="mobile-nav"
    >
      <div
        ref={containerRef}
        className="relative flex items-center rounded-lg bg-muted/80 dark:bg-muted/60 p-[3px] select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Sliding pill */}
        <div
          className={cn(
            "absolute top-[3px] bottom-[3px] left-[3px] right-[3px] rounded-md bg-background shadow-sm will-change-transform",
            isPressed
              ? "transition-[transform,box-shadow] duration-150 ease-out shadow-md scale-[0.97]"
              : "transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-sm"
          )}
          style={{
            width: `calc(${100 / segmentCount}% - 6px / ${segmentCount})`,
            left: '3px',
            transform: `translateX(calc(${activeIndex} * (${100 / segmentCount}% + 6px / ${segmentCount} * ${segmentCount - 1} / ${segmentCount})))`,
            // Simpler: use percentage of container width
          }}
          aria-hidden="true"
        />

        {allSegments.map((seg, i) => (
          <button
            key={seg}
            type="button"
            data-segment-index={i}
            data-onboarding={seg === "filters" ? "mobile-nav-manage" : undefined}
            role="tab"
            aria-selected={currentView === seg}
            aria-label={seg === "filters"
              ? t("navigation.views.switchTo", { view: t("navigation.views.manage") })
              : t("navigation.views.switchTo", { view: segmentLabels[seg] })
            }
            className={cn(
              "relative z-10 flex items-center justify-center gap-1 py-1.5 text-[13px] font-medium transition-all duration-150 flex-1 min-w-0 rounded-md",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "active:scale-95",
              currentView === seg
                ? "text-foreground"
                : "text-muted-foreground/70 dark:text-muted-foreground"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (seg !== currentView) onViewChange(seg);
            }}
            tabIndex={currentView === seg ? 0 : -1}
          >
            {seg === "filters" ? (
              <Filter className="w-4 h-4" />
            ) : (
              <>
                {seg === "feed" && <Rss className="w-3.5 h-3.5 shrink-0" />}
                {seg === "tree" && <GitBranch className="w-3.5 h-3.5 shrink-0" />}
                {seg === "list" && <List className="w-3.5 h-3.5 shrink-0" />}
                {seg === "calendar" && <Calendar className="w-3.5 h-3.5 shrink-0" />}
                <span className="truncate">{segmentLabels[seg]}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
