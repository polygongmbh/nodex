export type RelayProtocol = "ws" | "wss";

const DEFAULT_RELAY_COMMON_PREFIXES = ["feed", "nostr", "relay"] as const;

function normalizeRelayPrefixList(prefixes: string[]): string[] {
  const unique = new Set<string>();
  for (const prefix of prefixes) {
    const normalized = prefix.trim().toLowerCase().replace(/\.+$/g, "");
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

function parseRelayPrefixEnv(rawValue: unknown): string[] {
  if (typeof rawValue !== "string") return [];
  return normalizeRelayPrefixList(rawValue.split(","));
}

function getRelayEnvValue(
  key: "VITE_RELAY_COMMON_PREFIXES" | "VITE_RELAY_DISCOVERY_PREFIXES",
  env: Record<string, unknown>
): unknown {
  return env[key];
}

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

export function getRelayCommonPrefixes(env: Record<string, unknown> = import.meta.env): string[] {
  const configured = parseRelayPrefixEnv(getRelayEnvValue("VITE_RELAY_COMMON_PREFIXES", env));
  if (configured.length > 0) return configured;
  return [...DEFAULT_RELAY_COMMON_PREFIXES];
}

export function getRelayDiscoveryPrefixes(env: Record<string, unknown> = import.meta.env): string[] {
  const configured = parseRelayPrefixEnv(getRelayEnvValue("VITE_RELAY_DISCOVERY_PREFIXES", env));
  if (configured.length > 0) return configured;
  return getRelayCommonPrefixes(env);
}

function extractRelayHost(url: string): string {
  const normalized = normalizeRelayUrl(url);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    return parsed.hostname.trim().toLowerCase().replace(/\.+$/g, "");
  } catch {
    const noProtocol = normalized.replace(/^[a-z]+:\/\//i, "");
    const host = noProtocol
      .replace(/[/?#].*$/g, "")
      .replace(/:\d+$/g, "")
      .trim()
      .toLowerCase()
      .replace(/\.+$/g, "");
    return host;
  }
}

function relayUrlToLegacyName(url: string): string {
  return stripRelayProtocol(url)
    .replace(/^relay\./, "")
    .replace(/^nostr\./, "")
    .replace(/^nos\./, "")
    .split(".")[0];
}

export function relayUrlToDomainMinusTld(
  url: string,
  options?: {
    commonPrefixes?: string[];
    env?: Record<string, unknown>;
  }
): string {
  const host = extractRelayHost(url);
  if (!host) return relayUrlToLegacyName(url);

  const configuredPrefixes =
    options?.commonPrefixes && options.commonPrefixes.length > 0
      ? normalizeRelayPrefixList(options.commonPrefixes)
      : getRelayCommonPrefixes(options?.env ?? import.meta.env);
  const prefixSet = new Set(configuredPrefixes);
  const labels = host.split(".").filter(Boolean);
  while (labels.length > 0 && prefixSet.has(labels[0])) {
    labels.shift();
  }

  if (labels.length > 1) {
    labels.pop();
  }

  const candidate = labels.join(".");
  if (candidate) return candidate;

  const fallback = relayUrlToLegacyName(url);
  if (fallback) return fallback;
  return host;
}

export function relayUrlToId(url: string): string {
  return stripRelayProtocol(url).replace(/[./]/g, "-");
}

export function relayUrlToName(url: string): string {
  return relayUrlToDomainMinusTld(url);
}
