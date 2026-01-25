import { useRef, useCallback, TouchEvent } from "react";

interface UseSwipeNavigationOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  preventDefaultOnSwipe?: boolean;
  enableHaptics?: boolean;
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
}: UseSwipeNavigationOptions = {}) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

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

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
