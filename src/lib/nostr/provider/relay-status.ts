import { NDKRelayStatus as NativeNDKRelayStatus } from "@nostr-dev-kit/ndk";
import type { NDKRelayStatus } from "./contracts";

export const MAX_INITIAL_CONNECT_FAILURES = 5;
export const RELAY_STATUS_RECONCILE_INTERVAL_MS = 5000;

interface ResolveRelayLifecycleStatusOptions {
  mappedStatus: NDKRelayStatus["status"];
  previousStatus?: NDKRelayStatus["status"];
  hasConnectedOnce: boolean;
  isAutoPaused: boolean;
}

export function mapNativeRelayStatus(status: NativeNDKRelayStatus): NDKRelayStatus["status"] {
  switch (status) {
    case NativeNDKRelayStatus.CONNECTED:
    case NativeNDKRelayStatus.AUTHENTICATED:
    case NativeNDKRelayStatus.AUTH_REQUESTED:
    case NativeNDKRelayStatus.AUTHENTICATING:
      return "connected";
    case NativeNDKRelayStatus.CONNECTING:
    case NativeNDKRelayStatus.RECONNECTING:
    case NativeNDKRelayStatus.FLAPPING:
      return "connecting";
    case NativeNDKRelayStatus.DISCONNECTING:
    case NativeNDKRelayStatus.DISCONNECTED:
    default:
      return "disconnected";
  }
}

export function resolveRelayLifecycleStatus({
  mappedStatus,
  previousStatus,
  hasConnectedOnce,
  isAutoPaused,
}: ResolveRelayLifecycleStatusOptions): NDKRelayStatus["status"] {
  if (isAutoPaused) return "connection-error";
  if (mappedStatus !== "disconnected") return mappedStatus;
  if (hasConnectedOnce) return "disconnected";
  if (previousStatus === "connection-error" || previousStatus === "verification-failed") {
    return previousStatus;
  }
  return "connecting";
}
