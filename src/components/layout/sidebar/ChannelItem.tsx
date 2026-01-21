import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "@/types";

interface ChannelItemProps {
  channel: Channel;
  onToggle: () => void;
  onExclusive: () => void;
}

export function ChannelItem({ channel, onToggle, onExclusive }: ChannelItemProps) {
  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 pl-7 transition-all group hover:bg-sidebar-accent/50"
      )}
    >
      {/* Icon - click for exclusive */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExclusive();
        }}
        title="Show only this channel"
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

      {/* Name - click for toggle */}
      <button
        onClick={onToggle}
        className="flex-1 text-left"
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
