import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link2, SmilePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { canAuthorMutate } from "@/domain/content/task-edit-window";
import type { Post } from "@/types";

const OPEN_THRESHOLD_PX = 56;
const ACTIVATION_DELTA_PX = 4;
const ACTION_WIDTH_PX = 64;
const FLICK_VELOCITY_PX_PER_MS = 0.4;
const SETTLE_TRANSITION = "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)";
const RUBBER_BAND_C = 0.55;
const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😄", "🚀", "👀", "🙏", "🙌", "🛠️", "👎"];

type OpenSetter = (id: string | null) => void;
const openSetters = new Set<OpenSetter>();
let currentOpenId: string | null = null;

function setGlobalOpenId(id: string | null) {
  if (currentOpenId === id) return;
  currentOpenId = id;
  for (const setter of openSetters) setter(id);
}

// Apple's published elastic-resistance curve.
function rubberBand(overscroll: number, dimension: number) {
  if (overscroll <= 0 || dimension <= 0) return 0;
  return (1 - 1 / (overscroll * RUBBER_BAND_C / dimension + 1)) * dimension;
}

interface FeedTaskSwipeActionsProps {
  task: Post;
  currentUserPubkey?: string;
  hasChildren: boolean;
  onReact: (emoji: string) => void;
  onCopyPermalink: () => void;
  onDelete: () => void;
  children: ReactNode;
}

export function FeedTaskSwipeActions({
  task,
  currentUserPubkey,
  hasChildren,
  onReact,
  onCopyPermalink,
  onDelete,
  children,
}: FeedTaskSwipeActionsProps) {
  const { t } = useTranslation("tasks");
  const [openId, setOpenId] = useState<string | null>(currentOpenId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isOpen = openId === task.id;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const reactTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; right: number } | null>(null);

  const startXRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const startTranslateRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const activeRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const lastSampleRef = useRef<{ x: number; t: number } | null>(null);
  const prevSampleRef = useRef<{ x: number; t: number } | null>(null);

  useEffect(() => {
    openSetters.add(setOpenId);
    return () => {
      openSetters.delete(setOpenId);
    };
  }, []);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const pickerRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(isOpen);

  // If the row transitions from open to closed (another row opened, tap-outside,
  // or settle-closed), dismiss the picker too so it doesn't linger over a
  // collapsed row.
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) setPickerOpen(false);
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Tap outside the picker (but still inside the row) closes the picker.
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (event: Event) => {
      const picker = pickerRef.current;
      if (!picker) return;
      const target = event.target as Node | null;
      if (target && picker.contains(target)) return;
      setPickerOpen(false);
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [pickerOpen]);

  const gate = canAuthorMutate({ task, currentUserPubkey, hasChildren });
  const totalActions = 2 + (gate.canDelete ? 1 : 0);
  const totalWidth = totalActions * ACTION_WIDTH_PX;

  // Sync DOM transform to settled state whenever isOpen changes externally.
  // Skipped during an active drag (the gesture handlers own the transform then).
  useLayoutEffect(() => {
    if (activeRef.current) return;
    const target = isOpen ? -totalWidth : 0;
    dragOffsetRef.current = target;
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = SETTLE_TRANSITION;
    el.style.transform = `translate3d(${target}px, 0, 0)`;
  }, [isOpen, totalWidth]);

  // Tap anywhere outside the open row to close it (capture phase so it runs
  // before any new gesture activates).
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: Event) => {
      const container = containerRef.current;
      if (!container) return;
      const target = event.target as Node | null;
      if (target && container.contains(target)) return;
      // Picker is portaled outside the container; treat taps inside it as
      // taps inside the row so it doesn't collapse mid-pick.
      const picker = pickerRef.current;
      if (target && picker && picker.contains(target)) return;
      setGlobalOpenId(null);
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [isOpen]);

  const writeTransform = useCallback((value: number) => {
    const el = contentRef.current;
    if (el) el.style.transform = `translate3d(${value}px, 0, 0)`;
    dragOffsetRef.current = value;
  }, []);

  const scheduleTransformWrite = useCallback((value: number) => {
    pendingRef.current = value;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) writeTransform(pending);
    });
  }, [writeTransform]);

  const settle = useCallback((value: number, velocity: number) => {
    let target: number;
    if (velocity < -FLICK_VELOCITY_PX_PER_MS) target = -totalWidth;
    else if (velocity > FLICK_VELOCITY_PX_PER_MS) target = 0;
    else target = value < -OPEN_THRESHOLD_PX ? -totalWidth : 0;

    const el = contentRef.current;
    if (el) {
      el.style.transition = SETTLE_TRANSITION;
      el.style.transform = `translate3d(${target}px, 0, 0)`;
    }
    dragOffsetRef.current = target;
    if (target === 0) {
      if (currentOpenId === task.id) setGlobalOpenId(null);
    } else {
      setGlobalOpenId(task.id);
    }
  }, [task.id, totalWidth]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    startTranslateRef.current = dragOffsetRef.current;
    activeRef.current = false;
    lastSampleRef.current = { x: event.clientX, t: event.timeStamp };
    prevSampleRef.current = null;
    // We own the transform until release — kill any in-flight settle.
    const el = contentRef.current;
    if (el) el.style.transition = "";
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const dx = event.clientX - startXRef.current;
    const dy = event.clientY - startYRef.current;
    if (!activeRef.current) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      // Wait until horizontal motion has crossed the threshold AND
      // dominates the vertical component. No bail-out: if the user's
      // gesture turns out to be a vertical scroll, the browser engages
      // pan-y and fires pointercancel, which resets us cleanly.
      if (ax < ACTIVATION_DELTA_PX || ax <= ay) return;
      activeRef.current = true;
      try {
        // Capture on the same element that owns the listeners — the
        // content div — so subsequent pointer events keep being
        // delivered to these handlers even when the finger drifts off
        // the row or the content translates out from under it.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // pointer capture unsupported
      }
      // Claim the global open-slot now so any other open row collapses
      // immediately rather than waiting for this gesture to commit.
      setGlobalOpenId(task.id);
    }
    prevSampleRef.current = lastSampleRef.current;
    lastSampleRef.current = { x: event.clientX, t: event.timeStamp };

    const raw = startTranslateRef.current + dx;
    const dim = containerRef.current?.offsetWidth || totalWidth * 2;
    let next: number;
    if (raw >= 0) {
      next = 0;
    } else if (raw < -totalWidth) {
      next = -totalWidth - rubberBand(-totalWidth - raw, dim);
    } else {
      next = raw;
    }
    scheduleTransformWrite(next);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const wasActive = activeRef.current;
    startXRef.current = null;
    activeRef.current = false;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // pointer was never captured
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending !== null) writeTransform(pending);
    }
    if (!wasActive) return;

    let velocity = 0;
    if (prevSampleRef.current && lastSampleRef.current) {
      const dt = lastSampleRef.current.t - prevSampleRef.current.t;
      if (dt > 0) velocity = (lastSampleRef.current.x - prevSampleRef.current.x) / dt;
    }
    settle(dragOffsetRef.current, velocity);
  };

  const closeRow = () => {
    setGlobalOpenId(null);
  };

  const handleEmojiPick = (emoji: string) => {
    setPickerOpen(false);
    closeRow();
    onReact(emoji);
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden touch-pan-y"
      data-testid={`feed-task-swipe-container-${task.id}`}
    >
      <div
        aria-hidden={!isOpen}
        className={cn(
          "absolute inset-y-0 right-0 z-0 flex items-stretch",
          !isOpen && "pointer-events-none",
        )}
        style={{ width: `${totalWidth}px` }}
      >
        <button
          type="button"
          tabIndex={isOpen ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            closeRow();
            onCopyPermalink();
          }}
          className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium bg-primary text-primary-foreground"
          style={{ width: `${ACTION_WIDTH_PX}px` }}
          data-testid={`feed-task-swipe-copy-${task.id}`}
        >
          <Link2 className="h-4 w-4" />
          <span className="px-1 text-center leading-tight">{t("tasks.actions.copyPermalink")}</span>
        </button>
        <button
          ref={reactTriggerRef}
          type="button"
          tabIndex={isOpen ? 0 : -1}
          onClick={(event) => {
            event.stopPropagation();
            const trigger = reactTriggerRef.current;
            if (trigger) {
              const rect = trigger.getBoundingClientRect();
              setPickerAnchor({
                top: rect.bottom + 4,
                right: Math.max(8, window.innerWidth - rect.right),
              });
            }
            setPickerOpen((prev) => !prev);
          }}
          className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium bg-muted"
          style={{ width: `${ACTION_WIDTH_PX}px` }}
          data-testid={`feed-task-swipe-react-${task.id}`}
          aria-expanded={pickerOpen}
        >
          <SmilePlus className="h-4 w-4" />
          <span className="px-1 text-center leading-tight">{t("tasks.actions.react")}</span>
        </button>
        {gate.canDelete ? (
          <button
            type="button"
            tabIndex={isOpen ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              closeRow();
              onDelete();
            }}
            className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium bg-destructive text-destructive-foreground"
            style={{ width: `${ACTION_WIDTH_PX}px` }}
            data-testid={`feed-task-swipe-delete-${task.id}`}
          >
            <Trash2 className="h-4 w-4" />
            <span className="px-1 text-center leading-tight">{t("tasks.actions.delete")}</span>
          </button>
        ) : null}
      </div>
      <div
        ref={contentRef}
        className="relative z-10 bg-background will-change-transform"
        data-testid={`feed-task-swipe-content-${task.id}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        {children}
      </div>
      {pickerOpen && pickerAnchor && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pickerRef}
              role="dialog"
              onClick={(event) => event.stopPropagation()}
              className="fixed z-50 rounded-md border bg-popover p-2 shadow-md"
              style={{ top: `${pickerAnchor.top}px`, right: `${pickerAnchor.right}px` }}
              data-testid={`feed-task-swipe-picker-${task.id}`}
            >
              <div className="flex flex-wrap gap-1 max-w-[15rem]">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleEmojiPick(emoji);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted text-base leading-none"
                    data-testid={`feed-task-swipe-pick-${task.id}-${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
