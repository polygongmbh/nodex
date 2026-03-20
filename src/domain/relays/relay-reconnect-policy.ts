import type { Relay } from "@/types";

const RECONNECT_ON_SELECTION_STATUSES = new Set<NonNullable<Relay["connectionStatus"]>>([
  "disconnected",
  "connection-error",
  "verification-failed",
]);

export function shouldReconnectRelayOnSelection(status: Relay["connectionStatus"]): boolean {
  if (!status) return false;
  return RECONNECT_ON_SELECTION_STATUSES.has(status);
}
