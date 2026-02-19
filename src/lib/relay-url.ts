export type RelayProtocol = "ws" | "wss";

export function normalizeRelayUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isRelayUrl(value: string): boolean {
  const normalized = normalizeRelayUrl(value).toLowerCase();
  return normalized.startsWith("wss://") || normalized.startsWith("ws://");
}

export function ensureRelayProtocol(value: string, protocol: RelayProtocol = "wss"): string {
  const normalized = normalizeRelayUrl(value);
  if (!normalized) return normalized;
  if (isRelayUrl(normalized)) return normalized;
  return `${protocol}://${normalized}`;
}

export function stripRelayProtocol(value: string): string {
  return normalizeRelayUrl(value).replace("wss://", "").replace("ws://", "");
}

export function relayUrlToId(url: string): string {
  return stripRelayProtocol(url).replace(/[./]/g, "-");
}

export function relayUrlToName(url: string): string {
  return stripRelayProtocol(url)
    .replace(/^relay\./, "")
    .replace(/^nostr\./, "")
    .replace(/^nos\./, "")
    .split(".")[0];
}
