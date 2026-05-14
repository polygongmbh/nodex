import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link2, RefreshCcw, SmilePlus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { canAuthorMutate } from "@/domain/content/task-edit-window";
import type { Task } from "@/types";

const OPEN_THRESHOLD_PX = 56;
const ACTIVATION_DELTA_PX = 8;
const ACTION_WIDTH_PX = 64;

type OpenSetter = (id: string | null) => void;
const openSetters = new Set<OpenSetter>();
let currentOpenId: string | null = null;

function setGlobalOpenId(id: string | null) {
  if (currentOpenId === id) return;
  currentOpenId = id;
  for (const setter of openSetters) setter(id);
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
  const dragOffsetRef = useRef(0);
  const [translateX, setTranslateX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const startTranslateRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    openSetters.add(setOpenId);
    return () => {
      openSetters.delete(setOpenId);
    };
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

  const settle = useCallback((value: number) => {
    const target = -Math.abs(value) > -OPEN_THRESHOLD_PX ? 0 : -totalWidth;
    setTranslateX(target);
    dragOffsetRef.current = target;
    if (target === 0) {
      if (currentOpenId === task.id) setGlobalOpenId(null);
    } else {
      setGlobalOpenId(task.id);
    }
  }, [task.id, totalWidth]);

  useEffect(() => {
    if (isOpen) {
      setTranslateX(-totalWidth);
      dragOffsetRef.current = -totalWidth;
    } else {
      setTranslateX(0);
      dragOffsetRef.current = 0;
    }
  }, [isOpen, totalWidth]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    startXRef.current = event.clientX;
    startTranslateRef.current = dragOffsetRef.current;
    activeRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const delta = event.clientX - startXRef.current;
    if (!activeRef.current) {
      if (Math.abs(delta) < ACTIVATION_DELTA_PX) return;
      activeRef.current = true;
      containerRef.current?.setPointerCapture(event.pointerId);
    }
    const next = Math.min(0, Math.max(-totalWidth, startTranslateRef.current + delta));
    setTranslateX(next);
    dragOffsetRef.current = next;
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const wasActive = activeRef.current;
    startXRef.current = null;
    activeRef.current = false;
    try {
      containerRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // pointer was never captured
    }
    if (!wasActive) return;
    settle(dragOffsetRef.current);
  };

  const handleAction = (action: () => void) => {
    setGlobalOpenId(null);
    action();
  };

  return (
    <div ref={containerRef} className="relative overflow-hidden touch-pan-y">
      <div
        aria-hidden={!isOpen && translateX === 0}
        className="absolute inset-y-0 right-0 z-0 flex items-stretch"
        style={{ width: `${totalWidth}px` }}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
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
        className="relative z-10 bg-background"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ transform: `translateX(${translateX}px)`, transition: startXRef.current !== null ? undefined : "transform 180ms ease-out" }}
      >
        {children}
      </div>
    </div>
  );
}
