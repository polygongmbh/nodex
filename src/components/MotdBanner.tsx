import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { featureDebugLog } from "@/lib/feature-debug";
import { getMotdDismissStorageKey, resolveMotd } from "@/lib/motd";

const TAP_MAX_DURATION_MS = 250;
const TAP_MAX_MOVEMENT_PX = 10;

interface PointerGestureState {
  pointerId: number | null;
  startX: number;
  startY: number;
  startedAt: number;
}

function loadDismissedMotd(motd: string): boolean {
  try {
    return sessionStorage.getItem(getMotdDismissStorageKey(motd)) === "1";
  } catch {
    return false;
  }
}

function saveDismissedMotd(motd: string): void {
  try {
    sessionStorage.setItem(getMotdDismissStorageKey(motd), "1");
  } catch {
    // Ignore session storage failures in restricted/private browsing modes.
  }
}

export function MotdBanner() {
  const { t } = useTranslation("shell");
  const motd = useMemo(() => resolveMotd(), []);
  const [dismissed, setDismissed] = useState(() => (motd ? loadDismissedMotd(motd) : false));
  const pointerGestureRef = useRef<PointerGestureState | null>(null);
  const isVisible = Boolean(motd) && !dismissed;

  const dismissBanner = () => {
    saveDismissedMotd(motd);
    setDismissed(true);
    featureDebugLog("motd", "Dismissed MOTD banner");
  };

  const clearPointerGesture = () => {
    pointerGestureRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0) return;
    if ((event.target as HTMLElement).closest("[data-motd-dismiss]")) return;

    pointerGestureRef.current = {
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
    };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = pointerGestureRef.current;
    clearPointerGesture();

    if (!gesture) return;
    if (gesture.pointerId !== null && Number.isFinite(event.pointerId) && gesture.pointerId !== event.pointerId) return;
    if ((event.target as HTMLElement).closest("[data-motd-dismiss]")) return;

    const elapsed = event.timeStamp - gesture.startedAt;
    if (elapsed > TAP_MAX_DURATION_MS) return;

    const movedX = Math.abs(event.clientX - gesture.startX);
    const movedY = Math.abs(event.clientY - gesture.startY);
    if (movedX > TAP_MAX_MOVEMENT_PX || movedY > TAP_MAX_MOVEMENT_PX) return;

    const selection = window.getSelection?.();
    if (selection && selection.toString().trim().length > 0) return;

    dismissBanner();
  };

  useEffect(() => {
    featureDebugLog("motd", isVisible ? "Showing MOTD banner" : "MOTD banner hidden", {
      configured: Boolean(motd),
      dismissed,
      length: motd?.length,
    });
  }, [dismissed, isVisible, motd]);

  if (!isVisible || !motd) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[120] border-b border-amber-500/25 bg-amber-100/90 text-sm text-amber-950 shadow-sm backdrop-blur-sm dark:border-amber-400/20 dark:bg-amber-900/60 dark:text-amber-100">
      <div
        className="safe-area-top grid min-h-12 grid-cols-[2.25rem,minmax(0,1fr),2.25rem] items-center gap-2 px-3 py-2"
        data-testid="motd-banner-surface"
        onPointerCancel={clearPointerGesture}
        onPointerDown={handlePointerDown}
        onPointerLeave={clearPointerGesture}
        onPointerUp={handlePointerUp}
      >
        <div aria-hidden="true" className="h-9 w-9" />
        <p className="min-w-0 select-text whitespace-pre-wrap break-words text-center text-base font-medium leading-6">
          {motd}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 justify-self-end rounded-full text-amber-900 hover:bg-amber-200/70 hover:text-amber-950 dark:text-amber-100 dark:hover:bg-amber-700/30"
          data-motd-dismiss="true"
          onClick={dismissBanner}
          aria-label={t("motd.dismiss")}
          title={t("motd.dismiss")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
