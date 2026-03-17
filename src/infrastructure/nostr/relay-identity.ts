import { relayUrlToId, relayUrlToName } from "@/infrastructure/nostr/relay-url";

export function getRelayIdFromUrl(url: string): string {
  return relayUrlToId(url);
}

export function getRelayNameFromUrl(url: string): string {
  return relayUrlToName(url);
}
