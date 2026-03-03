import type NDK from "@nostr-dev-kit/ndk";
import { createNIP42Response } from "./nip42-auth";
import { nostrDevLog } from "./dev-logs";

export interface RelayVerificationEvent {
  relayUrl: string;
  operation: "read" | "write" | "unknown";
  outcome: "required" | "failed";
  reason?: string;
}

export function createRelayNip42AuthPolicy(
  ndk: NDK,
  onVerificationEvent?: (event: RelayVerificationEvent) => void
) {
  return async (relay: { url: string }, challenge: string) => {
    const relayUrl = relay.url;
    onVerificationEvent?.({ relayUrl, operation: "unknown", outcome: "required" });
    if (!ndk.signer) {
      nostrDevLog("relay", "NIP-42 auth requested without active signer", { relayUrl: relay.url });
      onVerificationEvent?.({
        relayUrl,
        operation: "unknown",
        outcome: "failed",
        reason: "missing-signer",
      });
      return false;
    }

    try {
      nostrDevLog("relay", "Relay requested NIP-42 auth challenge", {
        relayUrl: relay.url,
      });
      await createNIP42Response(ndk, ndk.signer, challenge, relay.url);
      // NDK consumes the signed auth event; actual acceptance is inferred from relay connectivity.
      return true;
    } catch (error) {
      console.error("NIP-42: Failed to create auth response:", error);
      onVerificationEvent?.({
        relayUrl,
        operation: "unknown",
        outcome: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };
}
