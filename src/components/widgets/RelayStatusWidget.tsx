// Intentionally retained for potential future sidebar/dashboard reuse.
import { Radio, WifiOff, Loader2, AlertCircle, ShieldAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";
import { RelayManagement } from "@/components/relay/RelayManagement";
import { getRelayStatusDotClass, getRelayStatusTextClass } from "@/components/relay/relayStatusStyles";
import { stripRelayProtocol } from "@/infrastructure/nostr/relay-url";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RelayStatusWidgetProps {
  relays: NDKRelayStatus[];
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
}

export function RelayStatusWidget({ relays, onAddRelay, onRemoveRelay }: RelayStatusWidgetProps) {
  const { t } = useTranslation();
  const getStatusColor = (status: NDKRelayStatus["status"]) => {
    return getRelayStatusDotClass(status);
  };

  return (
    <TooltipProvider>
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
                    {stripRelayProtocol(relay.url)}
                  </p>
                </div>
                {relay.status === "connected" ? (
                  <span className="text-xs text-muted-foreground">
                    {relay.latency ? `${relay.latency}ms` : t("relay.status.connected")}
                  </span>
                ) : relay.status === "read-only" ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn("inline-flex items-center gap-1 text-xs", getRelayStatusTextClass(relay.status))}>
                        {t("relay.status.readOnly")}
                        <Info className="h-3 w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-56 text-xs">
                      {t("relay.statusHints.readOnly")}
                    </TooltipContent>
                  </Tooltip>
                ) : relay.status === "connecting" ? (
                  <Loader2 className={cn("w-4 h-4 animate-spin", getRelayStatusTextClass(relay.status))} />
                ) : relay.status === "connection-error" ? (
                  <AlertCircle className={cn("w-4 h-4", getRelayStatusTextClass(relay.status))} />
                ) : relay.status === "verification-failed" ? (
                  <ShieldAlert className={cn("w-4 h-4", getRelayStatusTextClass(relay.status))} />
                ) : (
                  <WifiOff className={cn("w-4 h-4", getRelayStatusTextClass(relay.status))} />
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
    </TooltipProvider>
  );
}
