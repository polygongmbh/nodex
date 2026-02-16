import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "@/types";

interface ChannelItemProps {
  channel: Channel;
  onToggle: () => void;
  onExclusive: () => void;
  isKeyboardFocused?: boolean;
}

export function ChannelItem({ channel, onToggle, onExclusive, isKeyboardFocused = false }: ChannelItemProps) {
  return (
    <div
      data-sidebar-item={`channel-${channel.id}`}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 pl-7 transition-all group hover:bg-sidebar-accent/50",
        isKeyboardFocused && "ring-2 ring-primary ring-inset bg-sidebar-accent"
      )}
    >
      {/* Icon - click for toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title="Toggle channel filter"
        aria-label={`Toggle #${channel.name} filter`}
        className="hover:ring-2 hover:ring-primary/50 rounded"
      >
        <Hash
          className={cn(
            "w-4 h-4 transition-colors",
            channel.filterState === "included" && "text-channel-included",
            channel.filterState === "excluded" && "text-channel-excluded",
            channel.filterState === "neutral" && "text-channel-neutral group-hover:text-sidebar-foreground"
          )}
        />
      </button>

      {/* Name - click for exclusive */}
      <button
        onClick={onExclusive}
        className="flex-1 text-left"
        aria-label={`Show only #${channel.name}`}
      >
        <span
          className={cn(
            "text-sm transition-colors hover:text-primary",
            channel.filterState === "included" && "text-channel-included font-medium",
            channel.filterState === "excluded" && "text-channel-excluded line-through opacity-60",
            channel.filterState === "neutral" && "text-sidebar-foreground"
          )}
        >
          {channel.name}
        </span>
      </button>

      {channel.filterState !== "neutral" && (
        <div
          className={cn(
            "ml-auto w-1.5 h-1.5 rounded-full",
            channel.filterState === "included" && "bg-channel-included",
            channel.filterState === "excluded" && "bg-channel-excluded"
          )}
        />
      )}
    </div>
  );
}
