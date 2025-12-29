import { Radio, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const relays = [
  { url: "wss://relay.damus.io", status: "connected", latency: 45 },
  { url: "wss://nos.lol", status: "connected", latency: 82 },
  { url: "wss://relay.nostr.band", status: "connecting", latency: null },
  { url: "wss://relay.snort.social", status: "disconnected", latency: null },
];

export function RelayStatusWidget() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <h3 className="font-heading font-semibold text-foreground">Relay Status</h3>
        </div>
      </div>
      <div className="p-3 space-y-2">
        {relays.map(({ url, status, latency }) => (
          <div
            key={url}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                status === "connected" && "bg-success",
                status === "connecting" && "bg-warning animate-pulse",
                status === "disconnected" && "bg-destructive"
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate font-mono">
                {url.replace("wss://", "")}
              </p>
            </div>
            {status === "connected" ? (
              <span className="text-xs text-muted-foreground">{latency}ms</span>
            ) : status === "connecting" ? (
              <span className="text-xs text-warning">connecting...</span>
            ) : (
              <WifiOff className="w-4 h-4 text-destructive" />
            )}
          </div>
        ))}
      </div>
      <button className="w-full p-3 text-sm text-primary hover:bg-muted/30 transition-colors font-medium border-t border-border">
        Manage relays
      </button>
    </div>
  );
}
