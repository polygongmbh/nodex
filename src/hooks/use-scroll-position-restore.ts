import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Saves the scroll position of a container when navigating into a task scope
 * (focusedTaskId transitions null → non-null) and restores it when leaving
 * (non-null → null).
 *
 * The scroll position is captured continuously via a scroll event listener so
 * that the value is current at the moment the navigation happens, even though
 * useLayoutEffect only runs after the render with the new content.
 */
export function useScrollPositionRestore(
  focusedTaskId: string | null,
  scrollContainerRef: RefObject<HTMLDivElement | null>
) {
  const currentScrollTopRef = useRef<number>(0);
  const savedScrollTopRef = useRef<number | null>(null);
  const previousFocusedTaskIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      currentScrollTopRef.current = el.scrollTop;
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollContainerRef]);

  useLayoutEffect(() => {
    const prev = previousFocusedTaskIdRef.current;
    const curr = focusedTaskId;

    // Skip the initial render (prev === undefined)
    if (prev !== undefined) {
      const enteringScopedTask = prev === null && curr !== null;
      const leavingScopedTask = prev !== null && curr === null;

      if (enteringScopedTask) {
        savedScrollTopRef.current = currentScrollTopRef.current;
      } else if (leavingScopedTask && savedScrollTopRef.current !== null) {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
        }
        savedScrollTopRef.current = null;
      }
    }

    previousFocusedTaskIdRef.current = curr;
  }, [focusedTaskId, scrollContainerRef]);
}
