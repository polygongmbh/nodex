import { relayUrlToId, relayUrlToName } from "@/lib/nostr/relay-url";

export function getRelayIdFromUrl(url: string): string {
  return relayUrlToId(url);
}

export function getRelayNameFromUrl(url: string): string {
  return relayUrlToName(url);
}
