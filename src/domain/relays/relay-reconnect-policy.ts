import type { Relay } from "@/types";

export interface RelayAuthRecoveryAction {
  verificationOperation: "read" | "write";
}

export function shouldReconnectRelayOnSelection(status: Relay["connectionStatus"]): boolean {
  return resolveRelayAuthRecoveryAction(status) !== null;
}

export function resolveRelayAuthRecoveryAction(
  status: Relay["connectionStatus"]
): RelayAuthRecoveryAction | null {
  switch (status) {
    case "verification-failed":
      return {
        verificationOperation: "read",
      };
    case "read-only":
      return {
        verificationOperation: "write",
      };
    default:
      return null;
  }
}
