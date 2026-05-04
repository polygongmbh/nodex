import { cn } from "@/lib/utils";
import type { Relay } from "@/types";
import type { RelayConnectionStatus } from "./relayStatusStyles";

export function resolveRelayConnectionStatus(relay: Relay): RelayConnectionStatus {
  if (relay.id === "demo" || !relay.connectionStatus) return "connected";
  return relay.connectionStatus;
}

export function isRelayConnectionUsable(status: RelayConnectionStatus): boolean {
  return status === "connected" || status === "read-only";
}

/**
 * Shared chip className for relay chips on mobile (compose popover + manage section).
 * Mirrors the desktop sidebar pattern: when a relay is active but not usable, use
 * the warning surface instead of the primary surface so styling stays consistent
 * across surfaces (popover, manage list, sidebar).
 */
export function getRelayChipClassName(
  relay: Relay,
  status: RelayConnectionStatus,
  extra?: string
): string {
  const usable = isRelayConnectionUsable(status);
  return cn(
    "flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm border transition-colors touch-target-sm",
    relay.isActive && usable && "bg-primary/10 border-primary text-primary motion-filter-pop",
    relay.isActive && !usable && "bg-warning/10 border-warning/40 text-foreground motion-filter-pop",
    !relay.isActive && "border-border hover:bg-muted",
    extra
  );
}
