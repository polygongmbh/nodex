import { useRef, useCallback, useState, PointerEvent, useLayoutEffect } from "react";
import { Menu, Rss, GitBranch, List, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewType } from "@/components/tasks/ViewSwitcher";
import { useTranslation } from "react-i18next";

export type MobileViewType = ViewType;

interface MobileNavProps {
  currentView: MobileViewType;
  onViewChange: (view: MobileViewType) => void;
  onManageOpen?: () => void;
  isManageActive?: boolean;
}

const allSegments: MobileViewType[] = ["feed", "tree", "list", "calendar"];
const DRAG_THRESHOLD_PX = 12;

export function MobileNav({ currentView, onViewChange, onManageOpen, isManageActive = false }: MobileNavProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const lastDraggedSegmentRef = useRef<MobileViewType | null>(null);
  const [isPressed, setIsPressed] = useState(false);

  const segmentLabels: Partial<Record<MobileViewType, string>> = {
    feed: t("navigation.views.feed"),
    tree: t("navigation.views.tree"),
    list: t("navigation.views.upcoming"),
    calendar: t("navigation.views.calendar"),
  };

  const activeIndex = allSegments.indexOf(currentView);

  const updatePillPosition = useCallback(() => {
    const container = containerRef.current;
    const pill = pillRef.current;
    if (!container || !pill) return;

    const buttons = container.querySelectorAll<HTMLElement>("[data-segment-index]");
    const idx = activeIndex >= 0 ? activeIndex : 0;
    const activeButton = buttons[idx];
    if (!activeButton) return;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    pill.style.width = `${buttonRect.width}px`;
    pill.style.setProperty("--pill-x", `${buttonRect.left - containerRect.left - 3}px`);
  }, [activeIndex]);

  useLayoutEffect(() => {
    updatePillPosition();
    window.addEventListener("resize", updatePillPosition);
    return () => window.removeEventListener("resize", updatePillPosition);
  }, [updatePillPosition]);

  const resetPointerState = useCallback(() => {
    activePointerIdRef.current = null;
    dragStartRef.current = null;
    isDraggingRef.current = false;
    lastDraggedSegmentRef.current = null;
    setIsPressed(false);

    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  }, []);

  const getSegmentFromPointer = useCallback((clientX: number, clientY: number): MobileViewType | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const button = element?.closest<HTMLElement>("[data-segment-view]");
    const segment = button?.dataset.segmentView as MobileViewType | undefined;
    return segment ?? null;
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    activePointerIdRef.current = e.pointerId;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
    suppressClickRef.current = false;
    lastDraggedSegmentRef.current = currentView;
    setIsPressed(true);
  }, [currentView]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!isDraggingRef.current) {
      if (absDy > absDx && absDy > DRAG_THRESHOLD_PX) {
        resetPointerState();
        return;
      }

      if (absDx < DRAG_THRESHOLD_PX || absDx <= absDy) {
        return;
      }

      isDraggingRef.current = true;
      suppressClickRef.current = true;
    }

    const seg = getSegmentFromPointer(e.clientX, e.clientY);
    if (!seg || seg === lastDraggedSegmentRef.current) return;

    lastDraggedSegmentRef.current = seg;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
    onViewChange(seg);
  }, [getSegmentFromPointer, onViewChange, resetPointerState]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    resetPointerState();
  }, [resetPointerState]);

  const handlePointerCancel = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    resetPointerState();
  }, [resetPointerState]);

  return (
    <nav
      className="mx-2 mt-2 mb-1 safe-area-top"
      role="tablist"
      aria-label={t("navigation.aria.views")}
      data-onboarding="mobile-nav"
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-onboarding="mobile-nav-manage"
          aria-label={t("navigation.views.switchTo", { view: t("navigation.views.manage") })}
          className={cn(
            "flex items-center justify-center w-11 h-9 rounded-lg shrink-0 transition-colors duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            "active:scale-90",
            isManageActive
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-muted/80 dark:bg-muted/60 text-muted-foreground/70 dark:text-muted-foreground"
          )}
          onClick={onManageOpen}
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>

        <div
          ref={containerRef}
          className="relative flex items-center flex-1 min-w-0 rounded-lg bg-muted/80 dark:bg-muted/60 p-[3px] select-none touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div
            ref={pillRef}
            className={cn(
              "absolute top-[3px] bottom-[3px] rounded-md bg-primary will-change-transform",
              isManageActive && "opacity-0"
            )}
            style={{
              left: "3px",
              transform: isPressed
                ? "translateX(var(--pill-x, 0px)) scaleX(0.95) scaleY(0.88)"
                : "translateX(var(--pill-x, 0px))",
              transition: isPressed
                ? "box-shadow 150ms ease-out, opacity 150ms ease-out"
                : "transform 300ms cubic-bezier(0.25, 1, 0.5, 1), width 300ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 300ms ease-out, opacity 150ms ease-out",
              boxShadow: isPressed
                ? "0 8px 25px -4px rgba(0,0,0,0.25), 0 4px 10px -4px rgba(0,0,0,0.15)"
                : "0 2px 8px -2px rgba(0,0,0,0.12), 0 1px 3px -1px rgba(0,0,0,0.08)",
            }}
            aria-hidden="true"
          />

          {allSegments.map((seg, i) => (
            <button
              key={seg}
              type="button"
              data-segment-index={i}
              data-segment-view={seg}
              role="tab"
              aria-selected={currentView === seg && !isManageActive}
              aria-label={t("navigation.views.switchTo", { view: segmentLabels[seg] })}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1 py-1.5 text-[13px] font-medium transition-all duration-150 flex-1 min-w-0 rounded-md",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                "active:scale-90",
                currentView === seg && !isManageActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground/70 dark:text-muted-foreground"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (suppressClickRef.current) {
                  e.preventDefault();
                  return;
                }
                onViewChange(seg);
              }}
              tabIndex={currentView === seg ? 0 : -1}
            >
              {seg === "feed" && <Rss className="w-3.5 h-3.5 shrink-0" />}
              {seg === "tree" && <GitBranch className="w-3.5 h-3.5 shrink-0" />}
              {seg === "list" && <List className="w-3.5 h-3.5 shrink-0" />}
              {seg === "calendar" && <Calendar className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{segmentLabels[seg]}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
