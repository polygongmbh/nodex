import { Building2, Users, Gamepad2, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Relay } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { useTranslation } from "react-i18next";
import { getRelayStatusDotClass, getRelayStatusSurfaceClass } from "@/components/relay/relayStatusStyles";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { relayUrlToName } from "@/infrastructure/nostr/relay-url";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "building-2": Building2,
  users: Users,
  "gamepad-2": Gamepad2,
  cpu: Cpu,
};

interface RelayItemProps {
  relay: Relay;
  isKeyboardFocused?: boolean;
}

export function RelayItem({ relay, isKeyboardFocused = false }: RelayItemProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const Icon = iconMap[relay.icon] || Building2;
  const relayDisplayName = relay.url ? relayUrlToName(relay.url) : relay.name || relay.id;
  const resolvedConnectionStatus = relay.id === "demo" || !relay.connectionStatus ? "connected" : relay.connectionStatus;
  const isConnectionActive = resolvedConnectionStatus === "connected";
  const connectionDotClass = getRelayStatusDotClass(resolvedConnectionStatus);
  const connectionSurfaceClass = getRelayStatusSurfaceClass(resolvedConnectionStatus);

  return (
    <SidebarFilterRow
      itemId={`relay-${relay.id}`}
      isKeyboardFocused={isKeyboardFocused}
      className={cn(
        "gap-3 py-1.5",
        relay.isActive && "bg-sidebar-accent",
        relay.isActive && !isConnectionActive && "bg-warning/10"
      )}
    >
      {/* Icon - click for toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          void dispatchFeedInteraction({ type: "sidebar.relay.toggle", relayId: relay.id });
        }}
        title={t("sidebar.filters.toggleRelay", { name: relayDisplayName })}
        aria-label={t("sidebar.filters.toggleRelay", { name: relayDisplayName })}
      >
        <div
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:ring-2 hover:ring-primary/50",
            relay.isActive
              ? cn(connectionSurfaceClass, "motion-filter-pop")
              : "bg-muted/50 text-muted-foreground group-hover:text-sidebar-foreground"
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </button>

      {/* Name - click for exclusive */}
      <button
        onClick={() => {
          void dispatchFeedInteraction({ type: "sidebar.relay.exclusive", relayId: relay.id });
        }}
        className="flex-1 min-w-0 text-left"
        title={t("sidebar.filters.showOnlyRelay", { name: relayDisplayName })}
        aria-label={t("sidebar.filters.showOnlyRelay", { name: relayDisplayName })}
      >
        <span
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors hover:text-primary",
            relay.isActive ? "text-foreground font-medium" : "text-sidebar-foreground"
          )}
        >
          <span className="min-w-0 flex-1 truncate">{relayDisplayName}</span>
          {resolvedConnectionStatus === "read-only" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                      connectionDotClass
                    )}
                    aria-label={t("relay.statusHints.readOnly")}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56 text-xs">
                  {t("relay.statusHints.readOnly")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                connectionDotClass
              )}
              title={resolvedConnectionStatus}
              aria-label={resolvedConnectionStatus}
            />
          )}
        </span>
      </button>

      {relay.postCount && relay.postCount > 0 && (
        <span className="text-xs text-muted-foreground">{relay.postCount}</span>
      )}
    </SidebarFilterRow>
  );
}
