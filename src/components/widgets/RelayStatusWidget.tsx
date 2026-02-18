import { Radio, Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NDKRelayStatus } from "@/lib/nostr/ndk-context";
import { RelayManagement } from "@/components/relay/RelayManagement";
import { useTranslation } from "react-i18next";

interface RelayStatusWidgetProps {
  relays: NDKRelayStatus[];
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
}

export function RelayStatusWidget({ relays, onAddRelay, onRemoveRelay }: RelayStatusWidgetProps) {
  const { t } = useTranslation();
  const getStatusColor = (status: NDKRelayStatus["status"]) => {
    switch (status) {
      case "connected":
        return "bg-success";
      case "connecting":
        return "bg-warning animate-pulse";
      case "error":
        return "bg-destructive";
      default:
        return "bg-muted-foreground";
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-foreground">{t("widgets.relayStatus.title")}</h3>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {relays.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            {t("widgets.relayStatus.noneConnected")}
          </p>
        ) : (
          relays.map((relay) => (
            <div
              key={relay.url}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
            >
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  getStatusColor(relay.status)
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate font-mono">
                  {relay.url.replace("wss://", "").replace("ws://", "")}
                </p>
              </div>
              {relay.status === "connected" ? (
                <span className="text-xs text-muted-foreground">
                  {relay.latency ? `${relay.latency}ms` : t("widgets.relayStatus.connected")}
                </span>
              ) : relay.status === "connecting" ? (
                <Loader2 className="w-4 h-4 text-warning animate-spin" />
              ) : relay.status === "error" ? (
                <AlertCircle className="w-4 h-4 text-destructive" />
              ) : (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          ))
        )}
      </div>
      <RelayManagement
        relays={relays}
        onAddRelay={onAddRelay}
        onRemoveRelay={onRemoveRelay}
      />
    </div>
  );
}
