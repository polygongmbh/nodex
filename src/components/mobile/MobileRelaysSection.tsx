import { useState } from "react";
import { Radio, Plus, Trash2, Check, RotateCcw } from "lucide-react";
import type { Relay } from "@/types";
import { cn } from "@/lib/utils";
import { getRelayStatusDotClass } from "@/components/relay/relayStatusStyles";
import {
  getRelayChipClassName,
  isRelayConnectionUsable,
  resolveRelayConnectionStatus,
} from "@/components/relay/relayChipStyles";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import { useFeedInteractionDispatch } from "@/features/feed-page/interactions/feed-interaction-context";
import { relayUrlToName } from "@/infrastructure/nostr/relay-url";
import { resolveRelayIcon } from "@/infrastructure/nostr/relay-icon";

interface MobileRelaysSectionProps {
  relays: Relay[];
}

export function MobileRelaysSection({ relays }: MobileRelaysSectionProps) {
  const { t } = useTranslation("filters");
  const dispatchFeedInteraction = useFeedInteractionDispatch();
  const [newRelayUrl, setNewRelayUrl] = useState("");

  const handleAddRelay = () => {
    const trimmed = newRelayUrl.trim();
    if (!trimmed) return;
    void dispatchFeedInteraction({ type: "sidebar.relay.add", url: trimmed });
    setNewRelayUrl("");
  };

  return (
    <section data-onboarding="mobile-filters-relays">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-sm">{t("filters.feeds.title")}</h2>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={newRelayUrl}
          onChange={(e) => setNewRelayUrl(e.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            handleAddRelay();
          }}
          placeholder={t("filters.feeds.placeholder")}
          className="h-9"
        />
        <button
          onClick={handleAddRelay}
          className="px-3 h-10 rounded-lg border border-border text-sm flex items-center gap-1.5 touch-target-sm active:bg-muted transition-colors"
          aria-label={t("filters.feeds.addAria")}
        >
          <Plus className="w-4 h-4" />
          {t("filters.feeds.add")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {relays.map((relay) => {
          const RelayIcon = resolveRelayIcon(relay.url);
          const relayDisplayName = relayUrlToName(relay.url);
          const resolvedConnectionStatus = resolveRelayConnectionStatus(relay);
          const isUsable = isRelayConnectionUsable(resolvedConnectionStatus);
          const showStatusDot = resolvedConnectionStatus !== "connected";
          const connectionDotClass = getRelayStatusDotClass(resolvedConnectionStatus);
          const showReconnect =
            !!relay.url && relay.id !== "demo" && resolvedConnectionStatus !== "connected";
          const showRemove = !!relay.url && relay.id !== "demo";
          return (
            <div
              key={relay.id}
              className={getRelayChipClassName(relay, resolvedConnectionStatus)}
            >
              <button
                onClick={() => {
                  void dispatchFeedInteraction({
                    type: "sidebar.relay.select",
                    relayId: relay.id,
                    mode: "toggle",
                  });
                }}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <RelayIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">{relayDisplayName}</span>
                {showStatusDot && (
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full shrink-0",
                      connectionDotClass
                    )}
                    title={
                      resolvedConnectionStatus === "read-only"
                        ? t("relay:relay.statusHints.readOnly")
                        : resolvedConnectionStatus
                    }
                    aria-label={
                      resolvedConnectionStatus === "read-only"
                        ? t("relay:relay.statusHints.readOnly")
                        : resolvedConnectionStatus
                    }
                  />
                )}
                {relay.isActive && isUsable && (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>
              {(showReconnect || showRemove) && (
                <div className="flex items-center gap-0.5 shrink-0">
                  {showReconnect && (
                    <button
                      onClick={() => {
                        void dispatchFeedInteraction({
                          type: "sidebar.relay.reconnect",
                          url: relay.url!,
                          forceNewSocket: true,
                        });
                      }}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground active:bg-muted inline-flex items-center touch-target-sm"
                      aria-label={t("relay:relay.reconnect")}
                      title={t("relay:relay.reconnect")}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {showRemove && (
                    <button
                      onClick={() => {
                        void dispatchFeedInteraction({
                          type: "sidebar.relay.remove",
                          url: relay.url!,
                        });
                      }}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive active:bg-destructive/10 inline-flex items-center touch-target-sm"
                      aria-label={t("filters.feeds.removeAria", { name: relayDisplayName })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
