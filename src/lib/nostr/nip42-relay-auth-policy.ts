import type NDK from "@nostr-dev-kit/ndk";
import { createNIP42Response } from "./nip42-auth";
import { nostrDevLog } from "./dev-logs";

export function createRelayNip42AuthPolicy(ndk: NDK) {
  return async (relay: { url: string }, challenge: string) => {
    if (!ndk.signer) {
      console.warn("NIP-42: Relay requested auth without an active signer", { relayUrl: relay.url });
      return false;
    }

    try {
      nostrDevLog("relay", "Relay requested NIP-42 auth challenge", {
        relayUrl: relay.url,
      });
      return await createNIP42Response(ndk, ndk.signer, challenge, relay.url);
    } catch (error) {
      console.error("NIP-42: Failed to create auth response:", error);
      return false;
    }
  };
}
