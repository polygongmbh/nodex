import { NDKRelayStatus as NativeNDKRelayStatus } from "@nostr-dev-kit/ndk";
import type { NDKRelayStatus } from "./contracts";

export const MAX_INITIAL_CONNECT_FAILURES = 5;
export const RELAY_STATUS_RECONCILE_INTERVAL_MS = 5000;

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
