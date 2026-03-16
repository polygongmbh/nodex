import { Hash, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { useTranslation } from "react-i18next";

interface ChannelItemProps {
  channel: Channel;
  onToggle: () => void;
  onExclusive: () => void;
  isPinned?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  isKeyboardFocused?: boolean;
  className?: string;
}

export function ChannelItem({
  channel,
  onToggle,
  onExclusive,
  isPinned = false,
  onPin,
  onUnpin,
  isKeyboardFocused = false,
  className,
}: ChannelItemProps) {
  const { t } = useTranslation();
  const nextFilterStateLabel =
    channel.filterState === "neutral"
      ? t("sidebar.filterStates.include")
      : channel.filterState === "included"
        ? t("sidebar.filterStates.exclude")
        : t("sidebar.filterStates.unfiltered");

  return (
    <SidebarFilterRow
      itemId={`channel-${channel.id}`}
      isKeyboardFocused={isKeyboardFocused}
      className={cn("gap-2 py-1", className)}
    >
      {/* Icon - click for toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title={t("sidebar.filters.toggleChannelTo", { name: channel.name, nextState: nextFilterStateLabel })}
        aria-label={t("sidebar.filters.toggleChannelFilter", { name: channel.name })}
        className="hover:ring-2 hover:ring-primary/50 rounded"
      >
        <Hash
          className={cn(
            "w-4 h-4 transition-colors",
            channel.filterState === "included" && "text-channel-included motion-filter-pop",
            channel.filterState === "excluded" && "text-channel-excluded motion-filter-pop-alt",
            channel.filterState === "neutral" && "text-channel-neutral group-hover:text-sidebar-foreground"
          )}
        />
      </button>

      {/* Name - click for exclusive */}
      <button
        onClick={onExclusive}
        className="flex-1 text-left"
        aria-label={t("sidebar.filters.showOnlyChannel", { name: channel.name })}
        title={t("sidebar.filters.showOnlyChannel", { name: channel.name })}
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
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            channel.filterState === "included" && "bg-channel-included",
            channel.filterState === "excluded" && "bg-channel-excluded"
          )}
        />
      )}

      {(onPin || onUnpin) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (isPinned) {
              onUnpin?.();
              return;
            }
            onPin?.();
          }}
          title={isPinned
            ? t("sidebar.filters.unpinChannelFromView", { name: channel.name })
            : t("sidebar.filters.pinChannelToView", { name: channel.name })}
          aria-label={isPinned
            ? t("sidebar.filters.unpinChannelFromView", { name: channel.name })
            : t("sidebar.filters.pinChannelToView", { name: channel.name })}
          className={cn(
            "flex-shrink-0 transition-opacity",
            isPinned ? "opacity-100" : "opacity-0 group-hover:opacity-50 hover:!opacity-100"
          )}
        >
          <Pin
            className={cn(
              "w-3 h-3",
              isPinned ? "text-primary fill-primary" : "text-muted-foreground"
            )}
          />
        </button>
      )}
    </SidebarFilterRow>
  );
}
