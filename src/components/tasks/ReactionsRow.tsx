import { useState, type MouseEvent } from "react";
import { SmilePlus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TaskReactions } from "@/types";

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "😄", "🚀", "👀", "🙏", "🙌", "🛠️", "👎"];

interface ReactionsRowProps {
  targetId: string;
  reactions: TaskReactions | undefined;
  onReact: (emoji: string) => void;
  className?: string;
}

export function ReactionsRow({ targetId, reactions, onReact, className }: ReactionsRowProps) {
  const [open, setOpen] = useState(false);
  const totals = reactions?.totals ?? {};
  const mine = new Set(reactions?.mine ?? []);
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (entries.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)} data-testid={`reactions-row-${targetId}`}>
      {entries.map(([emoji, count]) => {
        const isMine = mine.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={(event: MouseEvent) => {
              event.stopPropagation();
              if (isMine) return;
              onReact(emoji);
            }}
            disabled={isMine}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none transition-colors",
              "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted",
              isMine && "border-primary/40 bg-primary/10 text-foreground cursor-default",
            )}
            title={isMine ? `You reacted with ${emoji}` : `React with ${emoji}`}
            data-testid={`reaction-chip-${targetId}-${emoji}`}
          >
            <span aria-hidden>{emoji}</span>
            <span>{count}</span>
          </button>
        );
      })}
      <ReactionPickerButton open={open} setOpen={setOpen} onPick={onReact} />
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
          aria-label="Add reaction"
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
