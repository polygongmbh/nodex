import { ensureRelayProtocol, relayUrlToId as toRelayId, RelayProtocol } from "@/lib/nostr/relay-url";

interface DefaultRelayEnv {
  VITE_DEFAULT_RELAYS?: string;
  VITE_DEFAULT_RELAY_DOMAIN?: string;
  VITE_DEFAULT_RELAY_PROTOCOL?: string;
  VITE_DEFAULT_RELAY_PORT?: string;
}

const HOST_DERIVED_RELAY_PREFIXES = ["nostr", "feed", "tasks", "base"] as const;
const DEFAULT_RELAY_PROBE_TIMEOUT_MS = 1200;

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

async function probeRelayAvailability(relayUrl: string, timeoutMs: number): Promise<boolean> {
  const WebSocketCtor = window.WebSocket;
  if (typeof WebSocketCtor !== "function") return false;

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const socket = new WebSocketCtor(relayUrl);
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(false);
    }, timeoutMs);

    socket.onopen = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      socket.close();
      resolve(true);
    };

    socket.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(false);
    };

    socket.onclose = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(false);
    };
  });
}

interface ResolveRelayFallbackOptions {
  hostname?: string;
  probeRelay?: (relayUrl: string) => Promise<boolean>;
  probeTimeoutMs?: number;
}

export async function resolveDefaultRelayUrlsWithDomainFallback(
  env: DefaultRelayEnv,
  options?: ResolveRelayFallbackOptions
): Promise<string[]> {
  const configuredRelays = resolveDefaultRelayUrls(env);
  if (configuredRelays.length > 0) return configuredRelays;
  if (typeof window === "undefined") return [];

  const protocol = toRelayProtocol(env.VITE_DEFAULT_RELAY_PROTOCOL);
  const hostname = options?.hostname ?? window.location.hostname;
  const candidates = getHostDerivedRelayCandidates(hostname, protocol);
  if (candidates.length === 0) return [];

  const probeTimeoutMs = options?.probeTimeoutMs ?? DEFAULT_RELAY_PROBE_TIMEOUT_MS;
  const probe = options?.probeRelay ?? ((relayUrl: string) => probeRelayAvailability(relayUrl, probeTimeoutMs));
  const probed = await Promise.all(candidates.map(async (relayUrl) => (await probe(relayUrl)) ? relayUrl : null));
  return probed.filter((value): value is string => Boolean(value));
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
