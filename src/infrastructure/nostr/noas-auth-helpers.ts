import { isRelayUrl, normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";

export interface NoasSignupOptions {
  redirect?: string;
  relays?: string[];
}

interface NoasRelayCarrier {
  relays?: string[];
}

export function buildNoasSignupOptions(
  connectedRelayUrls: string[],
  redirectOrigin?: string
): NoasSignupOptions {
  const relays = Array.from(
    new Set(
      connectedRelayUrls
        .map((relayUrl) => normalizeRelayUrl(relayUrl))
        .filter((relayUrl) => relayUrl && isRelayUrl(relayUrl))
    )
  );

  return {
    redirect: redirectOrigin,
    relays: relays.length > 0 ? relays : undefined,
  };
}

export function resolveNoasAuthRelayUrls(response: NoasRelayCarrier | null | undefined): string[] {
  if (!response?.relays) return [];

  return Array.from(
    new Set(
      response.relays
        .map((relayUrl) => normalizeRelayUrl(relayUrl))
        .filter((relayUrl) => relayUrl && isRelayUrl(relayUrl))
    )
  );
}
