import type { Relay } from "@/types";

export interface ManualRelayReconnectAction {
  reconnectTransport: boolean;
  retryAuth: boolean;
  replaySubscriptionsAfterAuth: boolean;
  verificationOperation: "read" | "write" | "unknown";
}

const DEFAULT_MANUAL_RECONNECT_ACTION: ManualRelayReconnectAction = {
  reconnectTransport: false,
  retryAuth: false,
  replaySubscriptionsAfterAuth: false,
  verificationOperation: "unknown",
};

export function shouldReconnectRelayOnSelection(status: Relay["connectionStatus"]): boolean {
  const reconnectAction = resolveManualRelayReconnectAction(status);
  return reconnectAction.reconnectTransport || reconnectAction.retryAuth;
}

export function resolveManualRelayReconnectAction(
  status: Relay["connectionStatus"]
): ManualRelayReconnectAction {
  switch (status) {
    case "verification-failed":
      return {
        ...DEFAULT_MANUAL_RECONNECT_ACTION,
        reconnectTransport: false,
        retryAuth: true,
        replaySubscriptionsAfterAuth: true,
        verificationOperation: "read",
      };
    case "read-only":
      return {
        ...DEFAULT_MANUAL_RECONNECT_ACTION,
        reconnectTransport: false,
        retryAuth: true,
        replaySubscriptionsAfterAuth: false,
        verificationOperation: "write",
      };
    case "disconnected":
    case "connection-error":
      return {
        ...DEFAULT_MANUAL_RECONNECT_ACTION,
        reconnectTransport: true,
      };
    default:
      return DEFAULT_MANUAL_RECONNECT_ACTION;
  }
}
