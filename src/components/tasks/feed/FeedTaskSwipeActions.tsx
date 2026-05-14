import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link2, RefreshCcw, SmilePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { canAuthorMutate } from "@/domain/content/task-edit-window";
import type { Task } from "@/types";

const OPEN_THRESHOLD_PX = 56;
const ACTIVATION_DELTA_PX = 4;
const ACTION_WIDTH_PX = 64;
const FLICK_VELOCITY_PX_PER_MS = 0.4;
const SETTLE_TRANSITION = "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1)";
const RUBBER_BAND_C = 0.55;

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
  task: Task;
  currentUserPubkey?: string;
  hasChildren: boolean;
  onReact: () => void;
  onCopyPermalink: () => void;
  onRecompose: () => void;
  onDelete: () => void;
  children: ReactNode;
}

export function FeedTaskSwipeActions({
  task,
  currentUserPubkey,
  hasChildren,
  onReact,
  onCopyPermalink,
  onRecompose,
  onDelete,
  children,
}: FeedTaskSwipeActionsProps) {
  const { t } = useTranslation("tasks");
  const [openId, setOpenId] = useState<string | null>(currentOpenId);
  const isOpen = openId === task.id;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

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

  const gate = canAuthorMutate({ task, currentUserPubkey, hasChildren });
  const actions: { key: string; label: string; icon: ReactNode; onClick: () => void; tone?: "destructive" | "warning" }[] = [
    { key: "copy", label: t("tasks.actions.copyPermalink"), icon: <Link2 className="h-4 w-4" />, onClick: onCopyPermalink },
    { key: "react", label: t("tasks.actions.react"), icon: <SmilePlus className="h-4 w-4" />, onClick: onReact },
  ];
  if (gate.canRecompose) {
    actions.push({ key: "recompose", label: t("tasks.actions.recompose"), icon: <RefreshCcw className="h-4 w-4" />, onClick: onRecompose, tone: "warning" });
  }
  if (gate.canDelete) {
    actions.push({ key: "delete", label: t("tasks.actions.delete"), icon: <Trash2 className="h-4 w-4" />, onClick: onDelete, tone: "destructive" });
  }
  const totalWidth = actions.length * ACTION_WIDTH_PX;

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
      if (ay >= ACTIVATION_DELTA_PX && ay > ax) {
        // Vertical intent — bail and let native scroll proceed.
        startXRef.current = null;
        return;
      }
      if (ax < ACTIVATION_DELTA_PX || ax <= ay) return;
      activeRef.current = true;
      try {
        containerRef.current?.setPointerCapture?.(event.pointerId);
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
      containerRef.current?.releasePointerCapture?.(event.pointerId);
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

  const handleAction = (action: () => void) => {
    setGlobalOpenId(null);
    action();
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
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            tabIndex={isOpen ? 0 : -1}
            onClick={(event) => {
              event.stopPropagation();
              handleAction(action.onClick);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
              "text-foreground/90",
              action.tone === "destructive" && "bg-destructive text-destructive-foreground",
              action.tone === "warning" && "bg-warning text-warning-foreground",
              !action.tone && action.key === "copy" && "bg-primary text-primary-foreground",
              !action.tone && action.key === "react" && "bg-muted",
            )}
            style={{ width: `${ACTION_WIDTH_PX}px` }}
            data-testid={`feed-task-swipe-${action.key}-${task.id}`}
          >
            {action.icon}
            <span className="px-1 text-center leading-tight">{action.label}</span>
          </button>
        ))}
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
    </div>
  );
}
