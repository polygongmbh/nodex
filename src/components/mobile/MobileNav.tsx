import { useRef, useCallback, PointerEvent, useLayoutEffect, useEffect } from "react";
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
  const pillStartXRef = useRef<number>(0);
  const cachedRectsRef = useRef<{ left: number; width: number; centerX: number }[] | null>(null);
  const isPressedRef = useRef(false);

  const segmentLabels: Partial<Record<MobileViewType, string>> = {
    feed: t("navigation.views.feed"),
    tree: t("navigation.views.tree"),
    list: t("navigation.views.upcoming"),
    calendar: t("navigation.views.calendar"),
  };

  const activeIndex = allSegments.indexOf(currentView);

  const getButtonRects = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const buttons = container.querySelectorAll<HTMLElement>("[data-segment-index]");
    const containerRect = container.getBoundingClientRect();
    return Array.from(buttons).map(btn => {
      const r = btn.getBoundingClientRect();
      return {
        left: r.left - containerRect.left - 3,
        width: r.width,
        centerX: r.left + r.width / 2,
      };
    });
  }, []);

  const updatePillPosition = useCallback(() => {
    // Don't update during drag — the drag handler owns pill position
    if (isDraggingRef.current) return;
    const pill = pillRef.current;
    if (!pill) return;
    const rects = getButtonRects();
    if (!rects) return;
    const idx = activeIndex >= 0 ? activeIndex : 0;
    const rect = rects[idx];
    if (!rect) return;

    pill.style.width = `${rect.width}px`;
    pill.style.setProperty("--pill-x", `${rect.left}px`);
  }, [activeIndex, getButtonRects]);

  useLayoutEffect(() => {
    updatePillPosition();
    window.addEventListener("resize", updatePillPosition);
    return () => window.removeEventListener("resize", updatePillPosition);
  }, [updatePillPosition]);

  // Sync pill pressed visual via DOM to avoid re-renders
  const setPillPressed = useCallback((pressed: boolean) => {
    isPressedRef.current = pressed;
    const pill = pillRef.current;
    if (!pill) return;
    if (pressed) {
      pill.style.transform = "translateX(var(--pill-x, 0px)) scaleX(0.95) scaleY(0.88)";
      pill.style.transition = "transform 16ms linear, box-shadow 150ms ease-out, opacity 150ms ease-out";
      pill.style.boxShadow = "0 8px 25px -4px rgba(0,0,0,0.25), 0 4px 10px -4px rgba(0,0,0,0.15)";
    } else {
      pill.style.transform = "translateX(var(--pill-x, 0px))";
      pill.style.transition = "transform 300ms cubic-bezier(0.25, 1, 0.5, 1), width 300ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 300ms ease-out, opacity 150ms ease-out";
      pill.style.boxShadow = "0 2px 8px -2px rgba(0,0,0,0.12), 0 1px 3px -1px rgba(0,0,0,0.08)";
    }
  }, []);

  // Set initial pill styles on mount
  useEffect(() => {
    setPillPressed(false);
  }, [setPillPressed]);

  const resetPointerState = useCallback(() => {
    const draggedSeg = lastDraggedSegmentRef.current;
    activePointerIdRef.current = null;
    dragStartRef.current = null;
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    lastDraggedSegmentRef.current = null;
    cachedRectsRef.current = null;
    setPillPressed(false);

    // If we dragged to a different segment, commit the view change now
    if (wasDragging && draggedSeg && draggedSeg !== currentView) {
      onViewChange(draggedSeg);
    } else {
      // Snap pill back
      updatePillPosition();
    }

    requestAnimationFrame(() => {
      suppressClickRef.current = false;
    });
  }, [updatePillPosition, setPillPressed, currentView, onViewChange]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    activePointerIdRef.current = e.pointerId;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
    suppressClickRef.current = false;
    lastDraggedSegmentRef.current = currentView;
    // Cache rects for the entire gesture
    cachedRectsRef.current = getButtonRects();
    const rects = cachedRectsRef.current;
    const idx = activeIndex >= 0 ? activeIndex : 0;
    pillStartXRef.current = rects?.[idx]?.left ?? 0;
    setPillPressed(true);
  }, [currentView, activeIndex, getButtonRects, setPillPressed]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId || !dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (!isDraggingRef.current) {
      if (absDy > absDx && absDy > DRAG_THRESHOLD_PX) {
        activePointerIdRef.current = null;
        dragStartRef.current = null;
        isDraggingRef.current = false;
        lastDraggedSegmentRef.current = null;
        cachedRectsRef.current = null;
        setPillPressed(false);
        updatePillPosition();
        return;
      }

      if (absDx < DRAG_THRESHOLD_PX || absDx <= absDy) {
        return;
      }

      isDraggingRef.current = true;
      suppressClickRef.current = true;
    }

    // Move pill directly via DOM — no React state
    const pill = pillRef.current;
    const rects = cachedRectsRef.current;
    if (pill && rects && rects.length > 0) {
      const minX = rects[0].left;
      const maxX = rects[rects.length - 1].left;
      const rawX = pillStartXRef.current + dx;
      const clampedX = Math.max(minX, Math.min(maxX, rawX));
      pill.style.setProperty("--pill-x", `${clampedX}px`);

      // Snap pill width to nearest segment
      const pillCenter = clampedX + pill.offsetWidth / 2;
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < rects.length; i++) {
        const segCenter = rects[i].left + rects[i].width / 2;
        const dist = Math.abs(pillCenter - segCenter);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      pill.style.width = `${rects[nearestIdx].width}px`;

      const seg = allSegments[nearestIdx];
      if (seg && seg !== lastDraggedSegmentRef.current) {
        lastDraggedSegmentRef.current = seg;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(10);
        }
      }
    }
  }, [setPillPressed, updatePillPosition]);

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
            style={{ left: "3px" }}
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