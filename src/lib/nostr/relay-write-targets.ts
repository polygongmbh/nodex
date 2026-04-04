import { dedupeNormalizedRelayUrls } from "@/infrastructure/nostr/relay-url";
import type { NDKRelayStatus } from "@/infrastructure/nostr/provider/contracts";
import type { Relay } from "@/types";

const DEMO_RELAY_ID = "demo";

export function isWritableAppRelay(relay: Relay): boolean {
  return relay.id !== DEMO_RELAY_ID
    && Boolean(relay.url)
    && (relay.connectionStatus === undefined || relay.connectionStatus === "connected");
}

export function isWritableNdkRelay(relay: NDKRelayStatus): boolean {
  return relay.status === "connected";
}

export function resolveWritableAppRelayUrls(relays: Relay[], relayScopeIds?: Set<string>): string[] {
  return dedupeNormalizedRelayUrls(
    relays
      .filter((relay) => isWritableAppRelay(relay) && (!relayScopeIds || relayScopeIds.has(relay.id)))
      .map((relay) => relay.url ?? "")
  );
}

export function resolveWritableNdkRelayUrls(relays: NDKRelayStatus[]): string[] {
  return dedupeNormalizedRelayUrls(
    relays
      .filter(isWritableNdkRelay)
      .map((relay) => relay.url)
  );
}

export function filterRelayUrlsToWritableSet(relayUrls: string[], writableRelayUrls: Set<string>): string[] {
  return dedupeNormalizedRelayUrls(relayUrls).filter((relayUrl) => writableRelayUrls.has(relayUrl));
}
