import { useRef, useCallback, TouchEvent, WheelEvent } from "react";
import { hasTextSelection } from "@/lib/click-intent";

interface UseSwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  preventDefaultOnSwipe?: boolean;
  enableHaptics?: boolean;
  enableWheelSwipe?: boolean;
  wheelCooldownMs?: number;
}

// Trigger haptic feedback if available
const triggerHaptic = (style: "light" | "medium" | "heavy" = "light") => {
  // Vibration API (Android, some iOS)
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const duration = style === "light" ? 10 : style === "medium" ? 20 : 30;
    navigator.vibrate(duration);
  }
};

const HORIZONTAL_SCROLL_OVERFLOW_VALUES = new Set(["auto", "scroll", "overlay"]);

/** Returns true when the touch target is inside a dnd-kit drag handle. */
function isInsideDndDragHandle(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el) {
    if (el.hasAttribute("data-dnd-handle")) return true;
    el = el.parentElement;
  }
  return false;
}
const WHEEL_GESTURE_IDLE_MS = 220;

function getHorizontalScrollableAncestor(target: EventTarget | null) {
  let current = target instanceof HTMLElement ? target : null;

  while (current) {
    const { overflowX } = window.getComputedStyle(current);
    if (
      HORIZONTAL_SCROLL_OVERFLOW_VALUES.has(overflowX) &&
      current.scrollWidth > current.clientWidth
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function canScrollHorizontallyInDirection(element: HTMLElement, deltaX: number) {
  return canScrollHorizontallyInDirectionFromPosition(
    element.scrollWidth,
    element.clientWidth,
    element.scrollLeft,
    deltaX,
  );
}

function canScrollHorizontallyInDirectionFromPosition(
  scrollWidth: number,
  clientWidth: number,
  scrollLeft: number,
  deltaX: number,
) {
  const maxScrollLeft = scrollWidth - clientWidth;
  if (maxScrollLeft <= 0 || deltaX === 0) return false;
  if (deltaX > 0) {
    return scrollLeft < maxScrollLeft;
  }
  return scrollLeft > 0;
}

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  preventDefaultOnSwipe = false,
  enableHaptics = true,
  enableWheelSwipe = false,
  wheelCooldownMs = 350,
}: UseSwipeNavigationOptions = {}) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchScrollContainer = useRef<HTMLElement | null>(null);
  const touchScrollStartLeft = useRef(0);
  const wheelAccumX = useRef(0);
  const wheelAccumY = useRef(0);
  const lastWheelEventAt = useRef(0);
  const lastWheelSwipeAt = useRef(0);
  const wheelGestureMode = useRef<"idle" | "scroll" | "navigate">("idle");

  const isDndTouch = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // When touch starts inside a DnD drag handle, let @hello-pangea/dnd own the gesture entirely.
    isDndTouch.current = isInsideDndDragHandle(e.target);
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
    touchEndX.current = null;
    touchScrollContainer.current = getHorizontalScrollableAncestor(e.target);
    touchScrollStartLeft.current = touchScrollContainer.current?.scrollLeft ?? 0;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (isDndTouch.current) {
      isDndTouch.current = false;
      touchStartX.current = null;
      touchStartY.current = null;
      touchEndX.current = null;
      return;
    }
    if (touchStartX.current === null || touchEndX.current === null || touchStartY.current === null) {
      return;
    }

    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    const activeScrollContainer = touchScrollContainer.current;
    const scrollCouldConsumeAtStart = activeScrollContainer
      ? canScrollHorizontallyInDirectionFromPosition(
          activeScrollContainer.scrollWidth,
          activeScrollContainer.clientWidth,
          touchScrollStartLeft.current,
          deltaX,
        )
      : false;
    const scrollConsumedGesture = activeScrollContainer
      ? activeScrollContainer.scrollLeft !== touchScrollStartLeft.current
      : false;
    const scrollCanConsumeGesture = activeScrollContainer
      ? canScrollHorizontallyInDirection(activeScrollContainer, deltaX)
      : false;
    
    // Only trigger swipe if horizontal movement is greater than vertical (to avoid conflicts with scrolling)
    // Skip when the user has an active text selection — they're selecting, not navigating.
    if (
      Math.abs(deltaX) > threshold &&
      Math.abs(deltaX) > deltaY &&
      !scrollCouldConsumeAtStart &&
      !scrollConsumedGesture &&
      !scrollCanConsumeGesture &&
      !hasTextSelection()
    ) {
      if (preventDefaultOnSwipe) {
        e.preventDefault();
      }
      
      // Trigger haptic feedback
      if (enableHaptics) {
        triggerHaptic("light");
      }
      
      if (deltaX > 0) {
        // Swiped left
        onSwipeLeft?.();
      } else {
        // Swiped right
        onSwipeRight?.();
      }
    }

    // Reset
    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchScrollContainer.current = null;
    touchScrollStartLeft.current = 0;
  }, [onSwipeLeft, onSwipeRight, threshold, preventDefaultOnSwipe, enableHaptics]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!enableWheelSwipe) return;

    const target = e.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
        return;
      }
    }

    const now = Date.now();
    if (now - lastWheelEventAt.current > WHEEL_GESTURE_IDLE_MS) {
      wheelAccumX.current = 0;
      wheelAccumY.current = 0;
      wheelGestureMode.current = "idle";
    }
    lastWheelEventAt.current = now;

    const { deltaX, deltaY } = e;
    const scrollContainer = target ? getHorizontalScrollableAncestor(target) : null;
    if (scrollContainer) {
      wheelGestureMode.current = "scroll";
      return;
    }
    if (wheelGestureMode.current === "scroll" || wheelGestureMode.current === "navigate") return;
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;

    if (wheelAccumX.current !== 0 && Math.sign(wheelAccumX.current) !== Math.sign(deltaX)) {
      wheelAccumX.current = 0;
      wheelAccumY.current = 0;
    }

    wheelAccumX.current += deltaX;
    wheelAccumY.current += Math.abs(deltaY);

    const absX = Math.abs(wheelAccumX.current);
    if (absX < threshold || absX <= wheelAccumY.current) return;
    if (now - lastWheelSwipeAt.current < wheelCooldownMs) return;

    if (preventDefaultOnSwipe) {
      e.preventDefault();
    }
    if (enableHaptics) {
      triggerHaptic("light");
    }

    if (wheelAccumX.current > 0) {
      onSwipeLeft?.();
    } else {
      onSwipeRight?.();
    }

    wheelGestureMode.current = "navigate";
    wheelAccumX.current = 0;
    wheelAccumY.current = 0;
  }, [
    onSwipeLeft,
    onSwipeRight,
    threshold,
    preventDefaultOnSwipe,
    enableHaptics,
    enableWheelSwipe,
    wheelCooldownMs,
  ]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onWheel: handleWheel,
  };
}
