import { useState, ReactNode } from "react";
import { Radio, Plus, X, Wifi, WifiOff, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NostrRelay } from "@/hooks/use-nostr";
import { useTranslation } from "react-i18next";

interface RelayManagementProps {
  relays: NostrRelay[];
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  trigger?: ReactNode;
}

export function RelayManagement({
  relays,
  onAddRelay,
  onRemoveRelay,
  trigger,
}: RelayManagementProps) {
  const { t } = useTranslation();
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const handleAddRelay = () => {
    if (!newRelayUrl.trim()) return;
    
    let url = newRelayUrl.trim();
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      url = `wss://${url}`;
    }
    
    onAddRelay(url);
    setNewRelayUrl("");
  };

  const connectedCount = relays.filter((r) => r.status === "connected").length;

  const getStatusIcon = (status: NostrRelay["status"]) => {
    switch (status) {
      case "connected":
        return <Wifi className="w-4 h-4 text-success" />;
      case "connecting":
        return <Loader2 className="w-4 h-4 text-warning animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-destructive" />;
      default:
        return <WifiOff className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: NostrRelay["status"]) => {
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

  const defaultTrigger = (
    <button className="w-full p-3 text-sm text-primary hover:bg-muted/30 transition-colors font-medium border-t border-border flex items-center justify-center gap-2">
      <Radio className="w-4 h-4" />
      {t("relay.manage", { connectedCount, totalCount: relays.length })}
    </button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary" />
            {t("relay.managementTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new relay */}
          <div className="flex gap-2">
            <Input
              placeholder={t("relay.placeholder")}
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddRelay();
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleAddRelay} size="icon">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Relay list */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {relays.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                {t("relay.noneConfigured")}
              </p>
            ) : (
              relays.map((relay) => (
                <div
                  key={relay.url}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  {/* Status indicator */}
                  <div
                    className={cn(
                      "w-2.5 h-2.5 rounded-full flex-shrink-0",
                      getStatusColor(relay.status)
                    )}
                  />

                  {/* Relay info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate text-foreground">
                      {relay.url.replace("wss://", "").replace("ws://", "")}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {getStatusIcon(relay.status)}
                      <span className="text-xs text-muted-foreground capitalize">
                        {relay.status}
                        {relay.status === "connected" && relay.latency && (
                          <span className="ml-1">({relay.latency}ms)</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Remove button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveRelay(relay.url)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Status summary */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              {t("relay.connectedSummary", { connectedCount, totalCount: relays.length })}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
