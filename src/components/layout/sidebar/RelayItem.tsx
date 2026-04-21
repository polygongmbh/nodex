import { cn } from "@/lib/utils";
import { Relay } from "@/types";
import { SidebarFilterRow } from "./SidebarFilterRow";
import { useTranslation } from "react-i18next";
import { getRelayStatusDotClass, getRelayStatusSurfaceClass } from "@/components/relay/relayStatusStyles";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { relayUrlToName, stripRelayProtocol } from "@/infrastructure/nostr/relay-url";
import { resolveRelayIcon } from "@/infrastructure/nostr/relay-icon";

interface RelayItemProps {
  relay: Relay;
  isKeyboardFocused?: boolean;
}

const STATUS_DOT_CLASS = "inline-block h-2 w-2 rounded-full";
const STATUS_TOOLTIP_SIDE = "right";
const STATUS_TOOLTIP_ALIGN = "start";

function resolveRelayIssueTooltip(
  t: ReturnType<typeof useTranslation>["t"],
  connectionStatus: NonNullable<Relay["connectionStatus"]>
): string | null {
  switch (connectionStatus) {
    case "connection-error":
      return t("relay.status.connectionError");
    case "verification-failed":
      return t("relay.status.readRejected");
    case "disconnected":
      return t("relay.status.disconnected");
    default:
      return null;
  }
}

export function RelayItem({ relay, isKeyboardFocused = false }: RelayItemProps) {
  const { t } = useTranslation();
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const Icon = resolveRelayIcon(relay.url);
  const relayDisplayName = relayUrlToName(relay.url);
  const relayTooltipName = stripRelayProtocol(relay.url);
  const resolvedConnectionStatus = relay.id === "demo" || !relay.connectionStatus ? "connected" : relay.connectionStatus;
  const isConnectionActive = resolvedConnectionStatus === "connected";
  const connectionDotClass = getRelayStatusDotClass(resolvedConnectionStatus);
  const connectionSurfaceClass = getRelayStatusSurfaceClass(resolvedConnectionStatus);
  const relayIssueTooltip = resolveRelayIssueTooltip(t, resolvedConnectionStatus);
  const suppressInteractionTitles = relayIssueTooltip !== null;

  const rowContent = (
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
          void dispatchFeedInteraction({ type: "sidebar.relay.select", relayId: relay.id, mode: "toggle" });
        }}
        title={suppressInteractionTitles ? undefined : t("sidebar.filters.toggleRelay", { name: relayTooltipName })}
        aria-label={t("sidebar.filters.toggleRelay", { name: relayTooltipName })}
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
          void dispatchFeedInteraction({ type: "sidebar.relay.select", relayId: relay.id, mode: "exclusive" });
        }}
        className="flex-1 min-w-0 text-left"
        title={suppressInteractionTitles ? undefined : t("sidebar.filters.showOnlyRelay", { name: relayTooltipName })}
        aria-label={t("sidebar.filters.showOnlyRelay", { name: relayTooltipName })}
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
                      "relative -m-2 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    )}
                    aria-label={t("relay.status.readOnly")}
                  >
                    <span
                      className={cn(
                        STATUS_DOT_CLASS,
                        connectionDotClass
                      )}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side={STATUS_TOOLTIP_SIDE} align={STATUS_TOOLTIP_ALIGN} sideOffset={8} className="max-w-56 text-xs">
                  {t("relay.status.readOnly")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span
              className={cn(
                STATUS_DOT_CLASS,
                "flex-shrink-0",
                connectionDotClass
              )}
              aria-label={resolvedConnectionStatus}
            />
          )}
        </span>
      </button>

    </SidebarFilterRow>
  );

  if (!relayIssueTooltip) return rowContent;

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">{rowContent}</div>
        </TooltipTrigger>
        <TooltipContent side={STATUS_TOOLTIP_SIDE} align={STATUS_TOOLTIP_ALIGN} sideOffset={8} className="max-w-56 text-xs">
          {relayIssueTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
