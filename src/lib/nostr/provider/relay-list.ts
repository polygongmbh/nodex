import type { NDKRelayStatus } from "./contracts";

export function normalizeRelayUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

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

export function mergeConfiguredRelayStatuses(params: {
  relays: NDKRelayStatus[];
  configuredRelayUrls: string[];
  removedRelayUrls?: Set<string>;
  relayInfoByUrl?: Map<string, { authRequired: boolean; supportsNip42: boolean }>;
}): NDKRelayStatus[] {
  const removedRelayUrls = params.removedRelayUrls ?? new Set<string>();
  const nextByUrl = new Map(
    params.relays.map((entry) => [normalizeRelayUrl(entry.url), entry])
  );

  params.configuredRelayUrls.forEach((relayUrl) => {
    const normalized = normalizeRelayUrl(relayUrl);
    if (!normalized || removedRelayUrls.has(normalized) || nextByUrl.has(normalized)) return;
    const info = params.relayInfoByUrl?.get(normalized);
    nextByUrl.set(normalized, {
      url: normalized,
      status: "connecting",
      nip11: info
        ? {
            authRequired: info.authRequired,
            supportsNip42: info.supportsNip42,
            checkedAt: Date.now(),
          }
        : undefined,
    });
  });

  return Array.from(nextByUrl.values());
}
