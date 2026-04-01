import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { SidebarPinButton } from "./SidebarPinButton";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";

interface ChannelItemProps {
  channel: Channel;
  isPinned?: boolean;
  isKeyboardFocused?: boolean;
  className?: string;
}

export function ChannelItem({
  channel,
  isPinned = false,
  isKeyboardFocused = false,
  className,
}: ChannelItemProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
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
      className={cn("relative gap-2 py-1.5", className)}
    >
      <SidebarPinButton
        dataTestId={`channel-item-pin-${channel.id}`}
        isPinned={isPinned}
        onClick={(e) => {
          e.stopPropagation();
          void dispatchFeedInteraction(
            isPinned
              ? { type: "sidebar.channel.unpin", channelId: channel.id }
              : { type: "sidebar.channel.pin", channelId: channel.id }
          );
        }}
        title={isPinned
          ? t("sidebar.filters.unpinChannelFromView", { name: channel.name })
          : t("sidebar.filters.pinChannelToView", { name: channel.name })}
        ariaLabel={isPinned
          ? t("sidebar.filters.unpinChannelFromView", { name: channel.name })
          : t("sidebar.filters.pinChannelToView", { name: channel.name })}
      />

      {/* Icon - click for toggle */}
      <button
        data-testid={`channel-item-toggle-${channel.id}`}
        onClick={(e) => {
          e.stopPropagation();
          void dispatchFeedInteraction({ type: "sidebar.channel.toggle", channelId: channel.id });
        }}
        title={t("sidebar.filters.toggleChannelTo", { name: channel.name, nextState: nextFilterStateLabel })}
        aria-label={t("sidebar.filters.toggleChannelFilter", { name: channel.name })}
        className="rounded transition-colors hover:ring-2 hover:ring-primary/50"
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
        data-testid={`channel-item-exclusive-${channel.id}`}
        onClick={() => {
          void dispatchFeedInteraction({ type: "sidebar.channel.exclusive", channelId: channel.id });
        }}
        className="flex flex-1 min-w-0 items-center text-left"
        aria-label={t("sidebar.filters.showOnlyChannel", { name: channel.name })}
        title={t("sidebar.filters.showOnlyChannel", { name: channel.name })}
      >
        <span
          className={cn(
            "block max-w-full truncate text-sm transition-colors hover:text-primary",
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
    </SidebarFilterRow>
  );
}
