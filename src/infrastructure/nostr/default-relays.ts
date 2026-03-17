import { ensureRelayProtocol, relayUrlToId as toRelayId, RelayProtocol } from "@/infrastructure/nostr/relay-url";
import { nostrDevLog } from "@/lib/nostr/dev-logs";

interface DefaultRelayEnv {
  VITE_DEFAULT_RELAYS?: string;
  VITE_DEFAULT_RELAY_DOMAIN?: string;
  VITE_DEFAULT_RELAY_PROTOCOL?: string;
  VITE_DEFAULT_RELAY_PORT?: string;
}

const HOST_DERIVED_RELAY_PREFIXES = ["nostr", "feed", "tasks", "base"] as const;
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

function toRelayProtocol(value?: string): RelayProtocol {
  return value?.trim().toLowerCase() === "ws" ? "ws" : "wss";
}

export function resolveDefaultRelayUrls(env: DefaultRelayEnv): string[] {
  const protocol = toRelayProtocol(env.VITE_DEFAULT_RELAY_PROTOCOL);
  const fromList = (env.VITE_DEFAULT_RELAYS || "")
    .split(",")
    .map((entry) => normalizeRelayUrl(entry, protocol))
    .filter((value): value is string => Boolean(value));

  const domain = env.VITE_DEFAULT_RELAY_DOMAIN?.trim();
  const port = env.VITE_DEFAULT_RELAY_PORT?.trim();
  const fromDomain = domain
    ? normalizeRelayUrl(`${domain}${port ? `:${port}` : ""}`, protocol)
    : null;

  const merged = [...fromList, ...(fromDomain ? [fromDomain] : [])];
  return Array.from(new Set(merged));
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
  return HOST_DERIVED_RELAY_PREFIXES.map((prefix) => `${protocol}://${prefix}.${targetBase}`);
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
  hostname?: string;
  probeRelay?: (relayUrl: string) => Promise<boolean>;
  probeTimeoutMs?: number;
}

async function probeHostFallbackCandidates(options: {
  candidates: string[];
  probe: (relayUrl: string) => Promise<boolean>;
  retryCount: number;
}): Promise<string[]> {
  const failedRelayUrls: string[] = [];
  const resolvedRelayUrls: string[] = [];

  for (const relayUrl of options.candidates) {
    const isAvailable = await options.probe(relayUrl);
    if (isAvailable) {
      resolvedRelayUrls.push(relayUrl);
      continue;
    }
    failedRelayUrls.push(relayUrl);
  }

  if (resolvedRelayUrls.length > 0 || failedRelayUrls.length === 0 || options.retryCount <= 0) {
    return resolvedRelayUrls;
  }

  let remaining = failedRelayUrls;
  for (let attempt = 1; attempt <= options.retryCount; attempt += 1) {
    const retryFailures: string[] = [];
    for (const relayUrl of remaining) {
      const isAvailable = await options.probe(relayUrl);
      if (isAvailable) {
        resolvedRelayUrls.push(relayUrl);
      } else {
        retryFailures.push(relayUrl);
      }
    }
    if (resolvedRelayUrls.length > 0 || retryFailures.length === 0) break;
    remaining = retryFailures;
  }

  return resolvedRelayUrls;
}

export async function resolveDefaultRelayUrlsWithDomainFallback(
  env: DefaultRelayEnv,
  options?: ResolveRelayFallbackOptions
): Promise<string[]> {
  const configuredRelays = resolveDefaultRelayUrls(env);
  if (configuredRelays.length > 0) return configuredRelays;
  if (typeof window === "undefined") return [];

  const protocol = toRelayProtocol(env.VITE_DEFAULT_RELAY_PROTOCOL);
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

export function getConfiguredDefaultRelays(): string[] {
  return resolveDefaultRelayUrls({
    VITE_DEFAULT_RELAYS: import.meta.env.VITE_DEFAULT_RELAYS,
    VITE_DEFAULT_RELAY_DOMAIN: import.meta.env.VITE_DEFAULT_RELAY_DOMAIN,
    VITE_DEFAULT_RELAY_PROTOCOL: import.meta.env.VITE_DEFAULT_RELAY_PROTOCOL,
    VITE_DEFAULT_RELAY_PORT: import.meta.env.VITE_DEFAULT_RELAY_PORT,
  });
}

export async function getConfiguredDefaultRelaysWithFallback(): Promise<string[]> {
  return await resolveDefaultRelayUrlsWithDomainFallback({
    VITE_DEFAULT_RELAYS: import.meta.env.VITE_DEFAULT_RELAYS,
    VITE_DEFAULT_RELAY_DOMAIN: import.meta.env.VITE_DEFAULT_RELAY_DOMAIN,
    VITE_DEFAULT_RELAY_PROTOCOL: import.meta.env.VITE_DEFAULT_RELAY_PROTOCOL,
    VITE_DEFAULT_RELAY_PORT: import.meta.env.VITE_DEFAULT_RELAY_PORT,
  });
}

export function relayUrlToId(url: string): string {
  return toRelayId(url);
}

export function getConfiguredDefaultRelayIds(): string[] {
  return getConfiguredDefaultRelays().map(relayUrlToId);
}
