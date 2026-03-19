import { useMemo, useState, ReactNode } from "react";
import {
  Radio,
  Plus,
  X,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  ClipboardList,
  Link2,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  Info,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";
import { ensureRelayProtocol, stripRelayProtocol } from "@/infrastructure/nostr/relay-url";
import { useTranslation } from "react-i18next";
import { getRelayStatusDotClass, getRelayStatusTextClass } from "./relayStatusStyles";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RelayManagementProps {
  relays: NDKRelayStatus[];
  onAddRelay: (url: string) => void;
  onRemoveRelay: (url: string) => void;
  onReconnectRelay?: (url: string) => void;
  trigger?: ReactNode;
}

export function RelayManagement({
  relays,
  onAddRelay,
  onRemoveRelay,
  onReconnectRelay,
  trigger,
}: RelayManagementProps) {
  const { t } = useTranslation();
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [expandedRelayUrl, setExpandedRelayUrl] = useState<string | null>(null);

  const handleAddRelay = () => {
    if (!newRelayUrl.trim()) return;
    
    const url = ensureRelayProtocol(newRelayUrl, "wss");
    
    onAddRelay(url);
    setNewRelayUrl("");
  };

  const connectedCount = relays.filter((r) => r.status === "connected").length;
  const readOnlyCount = relays.filter((r) => r.status === "read-only").length;
  const connectingCount = relays.filter((r) => r.status === "connecting").length;
  const disconnectedCount = relays.filter((r) => r.status === "disconnected").length;
  const connectionErrorCount = relays.filter((r) => r.status === "connection-error").length;
  const verificationFailedCount = relays.filter((r) => r.status === "verification-failed").length;
  const relayUrls = useMemo(() => relays.map((relay) => relay.url).join("\n"), [relays]);
  const relayDiagnostics = useMemo(() => JSON.stringify({
    generatedAt: new Date().toISOString(),
    counts: {
      total: relays.length,
      connected: connectedCount,
      readOnly: readOnlyCount,
      connecting: connectingCount,
      disconnected: disconnectedCount,
      connectionError: connectionErrorCount,
      verificationFailed: verificationFailedCount,
    },
    relays,
  }, null, 2), [connectedCount, connectingCount, connectionErrorCount, disconnectedCount, readOnlyCount, relays, verificationFailedCount]);

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch {
      toast.error(t("relay.copyFailed"));
    }
  };

  const getStatusIcon = (status: NDKRelayStatus["status"]) => {
    const colorClass = getRelayStatusTextClass(status);
    switch (status) {
      case "connected":
        return <Wifi className={cn("w-4 h-4", colorClass)} />;
      case "connecting":
        return <Loader2 className={cn("w-4 h-4 animate-spin", colorClass)} />;
      case "read-only":
        return <AlertCircle className={cn("w-4 h-4", colorClass)} />;
      case "connection-error":
        return <AlertCircle className={cn("w-4 h-4", colorClass)} />;
      case "verification-failed":
        return <ShieldAlert className={cn("w-4 h-4", colorClass)} />;
      default:
        return <WifiOff className={cn("w-4 h-4", colorClass)} />;
    }
  };

  const getStatusColor = (status: NDKRelayStatus["status"]) => {
    return getRelayStatusDotClass(status);
  };

  const getStatusLabel = (relay: NDKRelayStatus) => {
    const { status, nip11 } = relay;
    switch (status) {
      case "connection-error":
        return t("relay.status.connectionError");
      case "verification-failed":
        if (nip11?.authRequired) return t("relay.status.readRejectedAuthRequired");
        return t("relay.status.readRejected");
      case "read-only":
        return t("relay.status.readOnly");
      case "connected":
        if (nip11?.authRequired) return t("relay.status.connectedAuthRequired");
        return t("relay.status.connected");
      case "connecting":
        if (nip11?.authRequired) return t("relay.status.connectingAuthRequired");
        return t("relay.status.connecting");
      case "disconnected":
        return t("relay.status.disconnected");
      default:
        return status;
    }
  };

  const getCapabilityLabel = (value: boolean | undefined): string => {
    if (value === true) return t("relay.details.yes");
    if (value === false) return t("relay.details.no");
    return t("relay.details.unknown");
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
          <DialogDescription className="sr-only">
            {t("relay.managementDescription")}
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider>
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
          <div className="scrollbar-thin space-y-2 max-h-64 overflow-y-auto">
            {relays.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                {t("relay.noneConfigured")}
              </p>
            ) : (
              relays.map((relay) => (
                <div
                  key={relay.url}
                  className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors space-y-2"
                >
                  <div className="flex items-center gap-3">
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
                        {stripRelayProtocol(relay.url)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {getStatusIcon(relay.status)}
                        <span className="text-xs text-muted-foreground capitalize">
                          {getStatusLabel(relay)}
                          {relay.status === "connected" && relay.latency && (
                            <span className="ml-1">({relay.latency}ms)</span>
                          )}
                        </span>
                        {relay.status === "read-only" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                                aria-label={t("relay.statusHints.readOnly")}
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-56 text-xs">
                              {t("relay.statusHints.readOnly")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {relay.status === "read-only" && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("relay.statusHints.readOnly")}
                        </p>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() =>
                        setExpandedRelayUrl((current) => (current === relay.url ? null : relay.url))
                      }
                      aria-label={
                        expandedRelayUrl === relay.url
                          ? t("relay.details.hide")
                          : t("relay.details.show")
                      }
                    >
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 transition-transform",
                          expandedRelayUrl === relay.url ? "rotate-180" : "rotate-0"
                        )}
                      />
                    </Button>

                    {/* Remove button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => onReconnectRelay?.(relay.url)}
                      aria-label={t("relay.reconnect")}
                      title={t("relay.reconnect")}
                      disabled={relay.status === "connecting"}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveRelay(relay.url)}
                      aria-label={t("relay.remove")}
                      title={t("relay.remove")}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  {expandedRelayUrl === relay.url && (
                    <div className="rounded-md border border-border/60 bg-background/40 p-2 text-xs space-y-2">
                      <div className="flex items-center gap-1.5 text-foreground">
                        {relay.nip11?.authRequired ? (
                          <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 text-success" />
                        )}
                        <span className="font-medium">{t("relay.details.title")}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                        <span>{t("relay.details.authRequired")}</span>
                        <span className="text-foreground">
                          {getCapabilityLabel(relay.nip11?.authRequired)}
                        </span>
                        <span>{t("relay.details.supportsNip42")}</span>
                        <span className="text-foreground">
                          {getCapabilityLabel(relay.nip11?.supportsNip42)}
                        </span>
                        <span>{t("relay.details.nip11Checked")}</span>
                        <span className="text-foreground">
                          {relay.nip11?.checkedAt
                            ? new Date(relay.nip11.checkedAt).toLocaleTimeString()
                            : t("relay.details.unknown")}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Status summary */}
          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              {t("relay.connectedSummary", { connectedCount, totalCount: relays.length })}
            </p>
            <div className="rounded-md border border-border/60 bg-muted/20 p-2">
              <p className="text-xs font-medium text-foreground">{t("relay.debugTitle")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("relay.debugSummary", {
                  connected: connectedCount,
                  readOnly: readOnlyCount,
                  connecting: connectingCount,
                  disconnected: disconnectedCount,
                  connectionError: connectionErrorCount,
                  verificationFailed: verificationFailedCount,
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => void copyText(relayDiagnostics, t("relay.debugCopied"))}
                >
                  <ClipboardList className="mr-1 h-3.5 w-3.5" />
                  {t("relay.copyDebug")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => void copyText(relayUrls, t("relay.urlsCopied"))}
                >
                  <Link2 className="mr-1 h-3.5 w-3.5" />
                  {t("relay.copyUrls")}
                </Button>
              </div>
            </div>
          </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
