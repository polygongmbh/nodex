import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Unified scrim duration shared by every overlay surface (dialogs, sheets,
 * alert dialogs, onboarding intro, onboarding guide). Matches the gentle
 * fade used by the onboarding intro so transitions between overlays feel
 * consistent and never compound visually for long.
 */
export const OVERLAY_SCRIM_FADE_MS = 400;

interface OverlayScrimProps {
  /** Whether the scrim should be visible. */
  isOpen: boolean;
  /** Stacking layer; default sits below dialog content (z-[200]) by default. */
  zIndex?: number;
  /** Optional click handler (e.g. dismiss-on-overlay). */
  onClick?: () => void;
  className?: string;
  /** Render into a specific container; defaults to document.body. */
  container?: HTMLElement | null;
}

/**
 * Shared overlay scrim used by overlay surfaces that don't already get one
 * from a Radix primitive. Renders into a portal and fades in/out with the
 * unified timing so multiple overlays opening in sequence don't visually
 * compound their darkness for longer than necessary.
 */
export function OverlayScrim({
  isOpen,
  zIndex = 130,
  onClick,
  className,
  container,
}: OverlayScrimProps) {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      let secondFrame = 0;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setIsVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        window.cancelAnimationFrame(secondFrame);
      };
    }

    setIsVisible(false);
    if (!isMounted) return;
    const timeout = window.setTimeout(() => setIsMounted(false), OVERLAY_SCRIM_FADE_MS);
    return () => window.clearTimeout(timeout);
  }, [isOpen, isMounted]);

  if (!isMounted) return null;
  if (typeof document === "undefined") return null;

  const target = container ?? document.body;
  const style: CSSProperties = {
    opacity: isVisible ? 1 : 0,
    transitionProperty: "opacity",
    transitionDuration: `${OVERLAY_SCRIM_FADE_MS}ms`,
    transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
    zIndex,
  };

  return createPortal(
    <div
      aria-hidden="true"
      data-state={isVisible ? "open" : "closed"}
      onClick={onClick}
      className={cn("fixed inset-0 bg-overlay-scrim", className)}
      style={style}
    />,
    target,
  );
}
