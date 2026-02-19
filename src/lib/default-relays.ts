interface DefaultRelayEnv {
  VITE_DEFAULT_RELAYS?: string;
  VITE_DEFAULT_RELAY_DOMAIN?: string;
  VITE_DEFAULT_RELAY_PROTOCOL?: string;
  VITE_DEFAULT_RELAY_PORT?: string;
}

function normalizeRelayUrl(raw: string, fallbackProtocol: "ws" | "wss"): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
    return trimmed;
  }

  return `${fallbackProtocol}://${trimmed}`;
}

function toRelayProtocol(value?: string): "ws" | "wss" {
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

export function getConfiguredDefaultRelays(): string[] {
  return resolveDefaultRelayUrls({
    VITE_DEFAULT_RELAYS: import.meta.env.VITE_DEFAULT_RELAYS,
    VITE_DEFAULT_RELAY_DOMAIN: import.meta.env.VITE_DEFAULT_RELAY_DOMAIN,
    VITE_DEFAULT_RELAY_PROTOCOL: import.meta.env.VITE_DEFAULT_RELAY_PROTOCOL,
    VITE_DEFAULT_RELAY_PORT: import.meta.env.VITE_DEFAULT_RELAY_PORT,
  });
}

export function relayUrlToId(url: string): string {
  return url.replace(/\/+$/, "").replace("wss://", "").replace("ws://", "").replace(/[./]/g, "-");
}

export function getConfiguredDefaultRelayIds(): string[] {
  return getConfiguredDefaultRelays().map(relayUrlToId);
}
