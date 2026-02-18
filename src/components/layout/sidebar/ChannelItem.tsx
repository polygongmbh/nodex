import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { Channel } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { useTranslation } from "react-i18next";

interface ChannelItemProps {
  channel: Channel;
  onToggle: () => void;
  onExclusive: () => void;
  isKeyboardFocused?: boolean;
}

export function ChannelItem({ channel, onToggle, onExclusive, isKeyboardFocused = false }: ChannelItemProps) {
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
      className="gap-2 py-1"
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
            "ml-auto w-1.5 h-1.5 rounded-full",
            channel.filterState === "included" && "bg-channel-included",
            channel.filterState === "excluded" && "bg-channel-excluded"
          )}
        />
      )}
    </SidebarFilterRow>
  );
}
