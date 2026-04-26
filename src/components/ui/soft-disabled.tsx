import { useCallback, useMemo, type MouseEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * Soft-disabled controls *look* disabled but remain tappable so we can
 * surface a toast explaining why they're unavailable. This is critical on
 * touch devices, where a real `disabled` attribute swallows the tap and
 * leaves the user with no feedback (no hover, no title tooltip).
 *
 * Usage:
 *   const soft = useSoftDisabled({
 *     isBlocked: !canChangeStatus,
 *     onBlockedAttempt: () => guardModify(),
 *   });
 *
 *   <button
 *     {...soft.buttonProps}
 *     className={cn("...base...", soft.className)}
 *     onClick={soft.interceptClick(handleClick)}
 *   >...</button>
 */

export interface UseSoftDisabledOptions {
  /** When true, the control is rendered as soft-disabled. */
  isBlocked: boolean;
  /** Called when the user activates the control while blocked. */
  onBlockedAttempt?: () => void;
  /** Optional human-readable reason; surfaces as `title` for hover-capable inputs. */
  blockedTitle?: string;
}

export interface SoftDisabledState {
  isBlocked: boolean;
  /** Tailwind classes to apply to the control's surface. */
  className: string;
  /** ARIA + title props to spread on the control. */
  buttonProps: {
    "aria-disabled"?: boolean;
    "data-soft-disabled"?: "true";
    title?: string;
  };
  /**
   * Wrap your normal click handler. When blocked, the wrapper calls
   * `onBlockedAttempt()` and stops propagation so parent surfaces don't
   * also fire (e.g. a card's onClick won't focus the task).
   */
  interceptClick: <E extends HTMLElement>(
    handler?: (event: MouseEvent<E>) => void,
  ) => (event: MouseEvent<E>) => void;
  /**
   * Same idea for pointer-down handlers (used by long-press / capture-phase
   * status menu logic) — short-circuits when blocked.
   */
  interceptPointerDown: <E extends HTMLElement>(
    handler?: (event: PointerEvent<E>) => void,
  ) => (event: PointerEvent<E>) => void;
}

export function useSoftDisabled({
  isBlocked,
  onBlockedAttempt,
  blockedTitle,
}: UseSoftDisabledOptions): SoftDisabledState {
  const className = isBlocked ? "opacity-60 cursor-not-allowed" : "";

  const interceptClick = useCallback(
    <E extends HTMLElement>(handler?: (event: MouseEvent<E>) => void) =>
      (event: MouseEvent<E>) => {
        if (isBlocked) {
          event.preventDefault();
          event.stopPropagation();
          onBlockedAttempt?.();
          return;
        }
        handler?.(event);
      },
    [isBlocked, onBlockedAttempt],
  );

  const interceptPointerDown = useCallback(
    <E extends HTMLElement>(handler?: (event: PointerEvent<E>) => void) =>
      (event: PointerEvent<E>) => {
        if (isBlocked) {
          // Don't preventDefault — we still want the click event to fire so
          // interceptClick can surface the toast. Only stop propagation so
          // parent surfaces (card click, capture-phase status menus) don't
          // act on the pointer.
          event.stopPropagation();
          return;
        }
        handler?.(event);
      },
    [isBlocked],
  );

  const buttonProps = useMemo(
    () =>
      isBlocked
        ? {
            "aria-disabled": true as const,
            "data-soft-disabled": "true" as const,
            title: blockedTitle,
          }
        : {},
    [blockedTitle, isBlocked],
  );

  return {
    isBlocked,
    className,
    buttonProps,
    interceptClick,
    interceptPointerDown,
  };
}

/**
 * Convenience: combine an existing className with the soft-disabled classes
 * when needed. Used for components that don't take a hook (e.g. inline
 * children of a TaskSurface).
 */
export function softDisabledClassName(isBlocked: boolean, ...extra: Parameters<typeof cn>): string {
  return cn(extra, isBlocked && "opacity-60 cursor-not-allowed");
}
