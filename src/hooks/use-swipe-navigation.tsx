import { useRef, useCallback, TouchEvent, WheelEvent } from "react";

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
  const wheelAccumX = useRef(0);
  const wheelAccumY = useRef(0);
  const lastWheelEventAt = useRef(0);
  const lastWheelSwipeAt = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchStartY.current = e.targetTouches[0].clientY;
    touchEndX.current = null;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (touchStartX.current === null || touchEndX.current === null || touchStartY.current === null) {
      return;
    }

    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    
    // Only trigger swipe if horizontal movement is greater than vertical (to avoid conflicts with scrolling)
    if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > deltaY) {
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
    if (now - lastWheelEventAt.current > 120) {
      wheelAccumX.current = 0;
      wheelAccumY.current = 0;
    }
    lastWheelEventAt.current = now;

    const { deltaX, deltaY } = e;
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

    lastWheelSwipeAt.current = now;
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
