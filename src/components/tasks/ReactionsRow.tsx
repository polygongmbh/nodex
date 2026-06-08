import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TaskReactions } from "@/types";
import { getReactorsForTarget } from "@/features/feed-page/stores/reactions-registry";
import { ReactionReactorList } from "@/components/tasks/ReactionReactorList";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😄", "🚀", "👀", "🙏", "🙌", "🛠️", "👎"];
const LONG_PRESS_MS = 400;
const HOVER_CLOSE_MS = 120;
const PANEL_MAX_WIDTH_PX = 296;

interface ReactionsRowProps {
  targetId: string;
  reactions: TaskReactions | undefined;
  onReact: (emoji: string) => void;
  onUnreact?: (emoji: string) => void;
  className?: string;
}

export function ReactionsRow({ targetId, reactions, onReact, onUnreact, className }: ReactionsRowProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const totals = reactions?.totals ?? {};
  const mine = new Set(reactions?.mine ?? []);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openPanel = useCallback((trigger: HTMLElement) => {
    clearCloseTimer();
    const rect = trigger.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_MAX_WIDTH_PX)),
    });
    setPanelOpen(true);
    if (import.meta.env.DEV) {
      console.debug("[reactions] who-reacted opened", { targetId, emojis: entries.length });
    }
  }, [clearCloseTimer, entries.length, targetId]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setPanelOpen(false), HOVER_CLOSE_MS);
  }, [clearCloseTimer]);

  // While the panel is open, dismiss it on an outside tap or any scroll/resize
  // (a touch-opened panel has no pointer to leave, so these are its only exits).
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      if (target && rowRef.current?.contains(target)) return;
      setPanelOpen(false);
    };
    const onScrollOrResize = () => setPanelOpen(false);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [panelOpen]);

  useEffect(() => () => {
    clearCloseTimer();
    clearLongPressTimer();
  }, [clearCloseTimer, clearLongPressTimer]);

  if (entries.length === 0) return null;

  const handleChipPointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse") return;
    openPanel(event.currentTarget);
  };
  const handleChipPointerLeave = (event: PointerEvent<HTMLButtonElement>) => {
    clearLongPressTimer();
    if (event.pointerType !== "mouse") return;
    scheduleClose();
  };
  const handleChipPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    suppressClickRef.current = false;
    if (event.pointerType === "mouse") return;
    event.stopPropagation();
    const trigger = event.currentTarget;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      openPanel(trigger);
    }, LONG_PRESS_MS);
  };

  const renderPanel = () => {
    const reactorsByEmoji = getReactorsForTarget(targetId);
    const reactorEntries: [string, string[]][] = entries.map(([emoji]) => [
      emoji,
      reactorsByEmoji[emoji] ?? [],
    ]);
    return createPortal(
      <div
        ref={panelRef}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") clearCloseTimer();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") scheduleClose();
        }}
        onClick={(event) => event.stopPropagation()}
        className="fixed z-50 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
        style={{ top: `${anchor!.top}px`, left: `${anchor!.left}px`, maxWidth: `${PANEL_MAX_WIDTH_PX - 8}px` }}
        data-testid={`reactions-who-${targetId}`}
      >
        <ReactionReactorList entries={reactorEntries} targetId={targetId} />
      </div>,
      document.body,
    );
  };

  return (
    <div ref={rowRef} className={cn("flex flex-wrap items-center gap-1", className)} data-testid={`reactions-row-${targetId}`}>
      {entries.map(([emoji, count]) => {
        const isMine = mine.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onPointerEnter={handleChipPointerEnter}
            onPointerLeave={handleChipPointerLeave}
            onPointerDown={handleChipPointerDown}
            onPointerMove={clearLongPressTimer}
            onPointerUp={clearLongPressTimer}
            onPointerCancel={clearLongPressTimer}
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              if (isMine) {
                if (onUnreact) onUnreact(emoji);
                return;
              }
              onReact(emoji);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none transition-colors",
              "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted",
              isMine && "border-primary/40 bg-primary/10 text-foreground",
            )}
            title={isMine ? `Remove your ${emoji} reaction` : `React with ${emoji}`}
            data-testid={`reaction-chip-${targetId}-${emoji}`}
          >
            <span>{emoji}</span>
            <span>{count}</span>
          </button>
        );
      })}
      <ReactionPickerButton open={pickerOpen} setOpen={setPickerOpen} onPick={onReact} />
      {panelOpen && anchor && typeof document !== "undefined" ? renderPanel() : null}
    </div>
  );
}

interface ReactionPickerButtonProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  onPick: (emoji: string) => void;
}

function ReactionPickerButton({ open, setOpen, onPick }: ReactionPickerButtonProps) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Add reaction"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap gap-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-muted text-base leading-none"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
