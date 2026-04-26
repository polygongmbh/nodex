import { useCallback, useRef, type MouseEvent, type PointerEvent } from "react";

const DEFAULT_LONG_PRESS_MS = 500;

interface UseLongPressOptions {
  /** Fires after the user holds the control for `delayMs`. */
  onLongPress: () => void;
  /**
   * Fires when the user taps and releases without triggering the long-press.
   * Wired to `onClick` semantically — using this prop instead of the element's
   * `onClick` ensures the click is suppressed when a long-press fired.
   */
  onClick?: () => void;
  /** Hold duration in milliseconds. Defaults to 500ms. */
  delayMs?: number;
  /**
   * When false, neither the long-press timer nor the click handler will run.
   * Useful for soft-disabled controls.
   */
  enabled?: boolean;
}

/**
 * Reusable long-press gesture for buttons that need a secondary action on hold
 * (e.g. mobile filter buttons that open a selector on tap and reset filters
 * on hold). Spreading the returned props onto a `<button>` covers pointer/mouse
 * input on touch and desktop, and suppresses the synthetic click and the
 * native context menu when a long-press fired.
 */
export function useLongPress({
  onLongPress,
  onClick,
  delayMs = DEFAULT_LONG_PRESS_MS,
  enabled = true,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      // Ignore right-click etc.
      if (event.pointerType === "mouse" && event.button !== 0) return;
      longPressFiredRef.current = false;
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        longPressFiredRef.current = true;
        onLongPress();
      }, delayMs);
    },
    [clearTimer, delayMs, enabled, onLongPress]
  );

  const cancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // If the long-press fired during this gesture, swallow the click so we
      // don't also trigger the tap action.
      if (longPressFiredRef.current) {
        event.preventDefault();
        event.stopPropagation();
        longPressFiredRef.current = false;
        return;
      }
      if (!enabled) return;
      onClick?.();
    },
    [enabled, onClick]
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      // Prevent the long-press from also opening the native context menu on
      // touch/long-tap.
      if (longPressFiredRef.current) {
        event.preventDefault();
      }
    },
    []
  );

  return {
    onPointerDown: handlePointerDown,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: handleClick,
    onContextMenu: handleContextMenu,
  };
}
