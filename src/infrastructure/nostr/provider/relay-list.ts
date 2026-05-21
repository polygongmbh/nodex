import type { NDKRelayInformation } from "@nostr-dev-kit/ndk";
import type { NDKRelayStatus } from "./contracts";
import { buildNip11Status } from "./relay-status";
import { normalizeRelayUrl } from "@/infrastructure/nostr/relay-url";

export function appendResolvedRelayUrl(relayUrls: string[], relayUrl: string): string[] {
  const normalized = normalizeRelayUrl(relayUrl);
  if (!normalized) return relayUrls;
  if (relayUrls.some((entry) => normalizeRelayUrl(entry) === normalized)) {
    return relayUrls;
  }
  return [...relayUrls, normalized];
}

export function removeResolvedRelayUrl(relayUrls: string[], relayUrl: string): string[] {
  const normalized = normalizeRelayUrl(relayUrl);
  return relayUrls.filter((entry) => normalizeRelayUrl(entry) !== normalized);
}

export function reorderResolvedRelayStatuses(params: {
  relays: NDKRelayStatus[];
  orderedRelayUrls: string[];
}): NDKRelayStatus[] {
  const relayByUrl = new Map(
    params.relays.map((relay) => [normalizeRelayUrl(relay.url), relay] as const)
  );
  const seenRelayUrls = new Set<string>();
  const reordered: NDKRelayStatus[] = [];

  params.orderedRelayUrls
    .map(normalizeRelayUrl)
    .forEach((relayUrl) => {
      if (!relayUrl || seenRelayUrls.has(relayUrl)) return;
      const relay = relayByUrl.get(relayUrl);
      if (!relay) return;
      reordered.push(relay.url === relayUrl ? relay : { ...relay, url: relayUrl });
      seenRelayUrls.add(relayUrl);
    });

  params.relays.forEach((relay) => {
    const normalizedRelayUrl = normalizeRelayUrl(relay.url);
    if (!normalizedRelayUrl || seenRelayUrls.has(normalizedRelayUrl)) return;
    reordered.push(relay.url === normalizedRelayUrl ? relay : { ...relay, url: normalizedRelayUrl });
    seenRelayUrls.add(normalizedRelayUrl);
  });

  const unchanged = reordered.length === params.relays.length
    && reordered.every((relay, index) => relay === params.relays[index]);

  return unchanged ? params.relays : reordered;
}

export function filterAutoAddRelayUrls(params: {
  candidateRelayUrls: string[];
  existingRelayUrls: Iterable<string>;
  removedRelayUrls?: Iterable<string>;
}): string[] {
  const existingRelayUrls = new Set(Array.from(params.existingRelayUrls, normalizeRelayUrl));
  const removedRelayUrls = new Set(Array.from(params.removedRelayUrls ?? [], normalizeRelayUrl));

  return params.candidateRelayUrls
    .map(normalizeRelayUrl)
    .filter((relayUrl) => relayUrl && !existingRelayUrls.has(relayUrl) && !removedRelayUrls.has(relayUrl));
}

export function mergeConfiguredRelayStatuses(params: {
  relays: NDKRelayStatus[];
  configuredRelayUrls: string[];
  removedRelayUrls?: Set<string>;
  relayDocumentByUrl?: Map<string, NDKRelayInformation>;
}): NDKRelayStatus[] {
  const removedRelayUrls = params.removedRelayUrls ?? new Set<string>();
  const nextByUrl = new Map(
    params.relays
      .filter((entry) => {
        const normalized = normalizeRelayUrl(entry.url);
        return normalized && !removedRelayUrls.has(normalized);
      })
      .map((entry) => [normalizeRelayUrl(entry.url), entry])
  );

  params.configuredRelayUrls.forEach((relayUrl) => {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized || removedRelayUrls.has(normalized) || nextByUrl.has(normalized)) return;
    const document = params.relayDocumentByUrl?.get(normalized);
    nextByUrl.set(normalized, {
      url: normalized,
      status: "connecting",
      nip11: document ? buildNip11Status(document) : undefined,
    });
  });

  return Array.from(nextByUrl.values());
}
