import { normalizeRelayUrl as ndkNormalizeRelayUrl } from "@nostr-dev-kit/ndk";
import type { Relay } from "@/types";

// Defer to NDK so our canonical form (trailing slash) matches its pool keys.
// NDK throws on malformed input; callers here often handle untrusted strings
// (env vars, user input, third-party responses), so swallow and return "".
export function normalizeRelayUrl(value: string): string {
  if (!value) return "";
  try {
    return ndkNormalizeRelayUrl(value);
  } catch {
    return "";
  }
}

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

export function dedupeNormalizedRelayUrls(relayUrls: readonly string[]): string[] {
  return Array.from(new Set(relayUrls.map(normalizeRelayUrl).filter(Boolean)));
}

export function normalizeRelayUrlScope(relayUrls: readonly string[]): string[] {
  return [...dedupeNormalizedRelayUrls(relayUrls)].sort();
}

export function resolveRelayUrlsForIds(
  relays: Array<Pick<Relay, "id" | "url">>,
  relayIds: Iterable<string>
): string[] {
  const relayIdSet = relayIds instanceof Set ? relayIds : new Set(relayIds);
  return dedupeNormalizedRelayUrls(
    relays
      .filter((relay) => relayIdSet.has(relay.id))
      .map((relay) => relay.url)
  );
}

/**
 * The relays to publish an event that targets an existing post (reaction, deletion,
 * recompose-deletion) to: all of the target post's own relays. Returns `undefined` when those
 * relays are unknown, so the caller defers to the author's selected relays (via the publish fn's
 * fallback) instead of publishing nowhere.
 *
 * This is the single home for the "a child event follows its parent post's relays" rule — route the
 * reaction / deletion / recompose paths through it so their targeting can't drift apart. (The
 * separate "state updates go to the task's single origin relay" rule lives in resolveTaskOriginRelay
 * / resolveOriginRelayIdForTask, and is intentionally narrower.)
 */
export function resolveTargetPostRelayUrls(
  relays: Array<Pick<Relay, "id" | "url">>,
  targetRelayIds: Iterable<string>
): string[] | undefined {
  const urls = resolveRelayUrlsForIds(relays, targetRelayIds);
  return urls.length > 0 ? urls : undefined;
}

export function isRelayUrl(value: string): boolean {
  const normalized = normalizeRelayUrl(value).toLowerCase();
  return normalized.startsWith("wss://") || normalized.startsWith("ws://");
}

export function ensureRelayProtocol(value: string, protocol: RelayProtocol = "wss"): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Prepend the protocol BEFORE normalizing — NDK's normalize defaults the
  // protocol to http:// when missing, which would corrupt bare-hostname input.
  const lower = trimmed.toLowerCase();
  const withProtocol = lower.startsWith("ws://") || lower.startsWith("wss://")
    ? trimmed
    : `${protocol}://${trimmed}`;
  return normalizeRelayUrl(withProtocol);
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
  return stripRelayProtocol(url).toLowerCase().replace(/\/+$/, "").replace(/[./]/g, "-");
}

export function relayUrlToName(url: string): string {
  return relayUrlToDomainMinusTld(url);
}
