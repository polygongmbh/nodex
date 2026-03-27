import {
  ensureRelayProtocol,
  getRelayDiscoveryPrefixes,
  relayUrlToId as toRelayId,
  RelayProtocol,
} from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";

const DEFAULT_RELAY_PROBE_TIMEOUT_MS = 1200;
const DEFAULT_RELAY_PROBE_RETRY_COUNT = 1;
const HOST_FALLBACK_SUCCESS_CACHE_TTL_MS = 30 * 60 * 1000;
const HOST_FALLBACK_CACHE_KEY_PREFIX = "nodex.default-relay-fallback.v1";
let lastDiscoveryLogKey: string | null = null;

interface HostFallbackCacheEntry {
  checkedAt: number;
  relayUrls: string[];
}

function normalizeRelayUrl(raw: string, fallbackProtocol: RelayProtocol): string | null {
  const normalized = ensureRelayProtocol(raw, fallbackProtocol);
  return normalized || null;
}

export function resolveDefaultRelayUrls(relayUrls?: string[]): string[] {
  const normalized = (relayUrls ?? [])
    .map((entry) => normalizeRelayUrl(entry, "wss"))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(normalized));
}

function isIpAddress(hostname: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.includes(":");
}

function getHostDerivedRelayCandidates(hostname: string, protocol: RelayProtocol): string[] {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!normalizedHostname || normalizedHostname === "localhost" || isIpAddress(normalizedHostname)) {
    return [];
  }

  const labels = normalizedHostname.split(".").filter(Boolean);
  if (labels.length === 0) return [];

  const targetBase = labels.length >= 3 ? labels.slice(1).join(".") : normalizedHostname;
  const discoveryPrefixes = getRelayDiscoveryPrefixes();
  return discoveryPrefixes.map((prefix) => `${protocol}://${prefix}.${targetBase}`);
}

function getHostFallbackCacheKey(hostname: string, protocol: RelayProtocol): string {
  return `${HOST_FALLBACK_CACHE_KEY_PREFIX}:${protocol}:${hostname}`;
}

function readHostFallbackCache(hostname: string, protocol: RelayProtocol): string[] | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const key = getHostFallbackCacheKey(hostname, protocol);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch (error) {
    nostrDevLog("relay-discovery", "Host fallback cache read failed", {
      hostname,
      protocol,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as HostFallbackCacheEntry;
    const checkedAt = typeof parsed.checkedAt === "number" ? parsed.checkedAt : 0;
    const relayUrls = Array.isArray(parsed.relayUrls)
      ? parsed.relayUrls.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    if (!checkedAt || Date.now() - checkedAt > HOST_FALLBACK_SUCCESS_CACHE_TTL_MS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore cache cleanup errors in constrained browser modes.
      }
      return null;
    }
    return relayUrls;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore cache cleanup errors in constrained browser modes.
    }
    return null;
  }
}

function writeHostFallbackCache(hostname: string, protocol: RelayProtocol, relayUrls: string[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (relayUrls.length === 0) return;
  const key = getHostFallbackCacheKey(hostname, protocol);
  const payload: HostFallbackCacheEntry = {
    checkedAt: Date.now(),
    relayUrls,
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    nostrDevLog("relay-discovery", "Host fallback cache write failed", {
      hostname,
      protocol,
      relayUrls,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function probeRelayAvailability(relayUrl: string, timeoutMs: number): Promise<boolean> {
  const WebSocketCtor = window.WebSocket;
  if (typeof WebSocketCtor !== "function") return false;

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const socket = new WebSocketCtor(relayUrl);
    const finalize = (available: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      socket.onopen = null;
      socket.onerror = null;
      socket.onclose = null;
      resolve(available);
    };
    const timeoutId = window.setTimeout(() => {
      // Avoid forcing close() on in-flight handshakes; Firefox surfaces this as
      // "connection interrupted while page was loading", which is noisy for fallback probing.
      finalize(false);
    }, timeoutMs);

    socket.onopen = () => {
      if (settled) return;
      socket.close();
      finalize(true);
    };

    socket.onerror = () => {
      finalize(false);
    };

    socket.onclose = () => {
      finalize(false);
    };
  });
}

interface ResolveRelayFallbackOptions {
  relayUrls?: string[];
  hostname?: string;
  probeRelay?: (relayUrl: string) => Promise<boolean>;
  probeTimeoutMs?: number;
}

async function probeHostFallbackCandidates(options: {
  candidates: string[];
  probe: (relayUrl: string) => Promise<boolean>;
  retryCount: number;
}): Promise<string[]> {
  const probeBatch = async (relayUrls: string[]) => {
    const results = await Promise.all(
      relayUrls.map(async (relayUrl) => ({
        relayUrl,
        isAvailable: await options.probe(relayUrl),
      }))
    );

    const resolvedRelayUrls = results
      .filter((result) => result.isAvailable)
      .map((result) => result.relayUrl);
    const failedRelayUrls = results
      .filter((result) => !result.isAvailable)
      .map((result) => result.relayUrl);

    return {
      resolvedRelayUrls,
      failedRelayUrls,
    };
  };

  const firstAttempt = await probeBatch(options.candidates);
  const resolvedRelayUrls = [...firstAttempt.resolvedRelayUrls];

  if (
    resolvedRelayUrls.length > 0
    || firstAttempt.failedRelayUrls.length === 0
    || options.retryCount <= 0
  ) {
    return resolvedRelayUrls;
  }

  let remaining = firstAttempt.failedRelayUrls;
  for (let attempt = 1; attempt <= options.retryCount; attempt += 1) {
    const retryAttempt = await probeBatch(remaining);
    resolvedRelayUrls.push(...retryAttempt.resolvedRelayUrls);
    if (resolvedRelayUrls.length > 0 || retryAttempt.failedRelayUrls.length === 0) break;
    remaining = retryAttempt.failedRelayUrls;
  }

  return resolvedRelayUrls;
}

export async function resolveDefaultRelayUrlsWithDomainFallback(
  options?: ResolveRelayFallbackOptions
): Promise<string[]> {
  const configuredRelays = resolveDefaultRelayUrls(options?.relayUrls);
  if (configuredRelays.length > 0) return configuredRelays;
  if (typeof window === "undefined") return [];

  const protocol: RelayProtocol = "wss";
  const hostname = (options?.hostname ?? window.location.hostname).trim().toLowerCase().replace(/\.$/, "");
  const candidates = getHostDerivedRelayCandidates(hostname, protocol);
  nostrDevLog("relay-discovery", "Resolved host fallback candidates", {
    hostname,
    protocol,
    candidates,
  });
  if (candidates.length === 0) return [];

  const cachedRelayUrls = readHostFallbackCache(hostname, protocol);
  if (cachedRelayUrls && cachedRelayUrls.length > 0) {
    const cachedSet = new Set(cachedRelayUrls);
    const cachedCandidates = candidates.filter((relayUrl) => cachedSet.has(relayUrl));
    if (cachedCandidates.length === 0) {
      nostrDevLog("relay-discovery", "Ignoring stale host fallback cache with no matching candidates", {
        hostname,
        protocol,
        cachedRelayUrls,
        candidates,
      });
    } else {
      nostrDevLog("relay-discovery", "Using cached host fallback relays", {
        hostname,
        protocol,
        relayUrls: cachedCandidates,
      });
      return cachedCandidates;
    }
  }

  const probeTimeoutMs = options?.probeTimeoutMs ?? DEFAULT_RELAY_PROBE_TIMEOUT_MS;
  const probe = options?.probeRelay ?? ((relayUrl: string) => probeRelayAvailability(relayUrl, probeTimeoutMs));
  nostrDevLog("relay-discovery", "Probing host fallback relay candidates", {
    hostname,
    protocol,
    probeTimeoutMs,
    candidates,
    retryCount: DEFAULT_RELAY_PROBE_RETRY_COUNT,
  });
  const resolvedRelayUrls = await probeHostFallbackCandidates({
    candidates,
    probe,
    retryCount: DEFAULT_RELAY_PROBE_RETRY_COUNT,
  });
  nostrDevLog("relay-discovery", "Host fallback probe completed", {
    hostname,
    protocol,
    resolvedRelayUrls,
  });
  if (resolvedRelayUrls.length > 0) {
    const logKey = `${hostname}|${resolvedRelayUrls.slice().sort().join(",")}`;
    if (logKey !== lastDiscoveryLogKey) {
      lastDiscoveryLogKey = logKey;
      nostrDevLog("relay-discovery", "Host-derived relays discovered", {
        hostname,
        relayUrls: resolvedRelayUrls,
      });
    }
  }
  if (resolvedRelayUrls.length > 0) {
    writeHostFallbackCache(hostname, protocol, resolvedRelayUrls);
    return resolvedRelayUrls;
  }

  nostrDevLog("relay-discovery", "Host fallback probe found no reachable candidates; using optimistic relay list", {
    hostname,
    protocol,
    relayUrls: candidates,
  });
  return candidates;
}

const CONFIGURED_RELAY_URLS: string[] = (import.meta.env.VITE_DEFAULT_RELAYS || "")
  .split(/[,;\s]+/)
  .filter(Boolean);

export function getConfiguredDefaultRelays(): string[] {
  return resolveDefaultRelayUrls(CONFIGURED_RELAY_URLS);
}

export async function getConfiguredDefaultRelaysWithFallback(): Promise<string[]> {
  return await resolveDefaultRelayUrlsWithDomainFallback({ relayUrls: CONFIGURED_RELAY_URLS });
}

export function relayUrlToId(url: string): string {
  return toRelayId(url);
}

export function getConfiguredDefaultRelayIds(): string[] {
  return getConfiguredDefaultRelays().map(relayUrlToId);
}
