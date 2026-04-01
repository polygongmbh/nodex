import { nostrDevLog } from "@/lib/nostr/dev-logs";

interface NoasDiscoveryDocument {
  noas?: {
    api_base?: unknown;
  };
}

export interface NoasDiscoveryResult {
  discoveryOrigin: string;
  discoveredApiBaseUrl: string;
}

const noasApiBaseDiscoverySessionCache = new Map<string, string>();

function resolveDiscoveredNoasApiBaseUrl(discoveryOrigin: string, rawApiBase: unknown): string {
  if (typeof rawApiBase !== "string") return "";

  const trimmed = rawApiBase.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("/")) {
    return normalizeNoasBaseUrl(`${discoveryOrigin}${trimmed}`);
  }

  return normalizeNoasBaseUrl(trimmed);
}

function resolveFallbackNoasApiBaseUrl(rawValue: string): string {
  const normalized = normalizeNoasBaseUrl(rawValue);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    const rawPath = parsed.pathname.replace(/\/+$/, "");
    const lowerPath = rawPath.toLowerCase();
    const looksLikeEndpointPath = [
      "/signin",
      "/register",
      "/auth/signin",
      "/auth/register",
      "/picture",
      "/health",
    ].some((candidate) => lowerPath.endsWith(candidate));

    let apiPath = rawPath;
    if (!apiPath || apiPath === "/") {
      apiPath = "/api/v1";
    } else if (lowerPath.endsWith("/api/v1")) {
      apiPath = rawPath;
    } else if (looksLikeEndpointPath) {
      apiPath = "/api/v1";
    } else {
      apiPath = `${rawPath}/api/v1`;
    }

    parsed.pathname = apiPath.replace(/\/{2,}/g, "/");
    parsed.search = "";
    parsed.hash = "";
    return normalizeNoasBaseUrl(parsed.toString());
  } catch {
    return normalized;
  }
}

export function normalizeNoasBaseUrl(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
}

export function isValidNoasBaseUrl(rawValue: string): boolean {
  const normalized = normalizeNoasBaseUrl(rawValue);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function resolveNoasDiscoveryOrigin(rawValue: string): string {
  const normalized = normalizeNoasBaseUrl(rawValue);
  if (!normalized) return "";

  try {
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

function loadSessionCachedNoasApiBaseUrl(discoveryOrigin: string): string {
  const cachedApiBaseUrl = noasApiBaseDiscoverySessionCache.get(discoveryOrigin) || "";
  const normalizedApiBaseUrl = normalizeNoasBaseUrl(cachedApiBaseUrl);
  return isValidNoasBaseUrl(normalizedApiBaseUrl) ? normalizedApiBaseUrl : "";
}

function cacheNoasApiBaseUrlInSession(discoveryOrigin: string, apiBaseUrl: string): void {
  noasApiBaseDiscoverySessionCache.set(discoveryOrigin, apiBaseUrl);
}

export function clearNoasApiBaseDiscoverySessionCacheForTests(): void {
  noasApiBaseDiscoverySessionCache.clear();
}

export async function discoverNoasApiBaseUrl(rawValue: string): Promise<NoasDiscoveryResult | null> {
  const normalizedBaseUrl = normalizeNoasBaseUrl(rawValue);
  if (!normalizedBaseUrl || !isValidNoasBaseUrl(normalizedBaseUrl)) return null;

  const discoveryOrigin = resolveNoasDiscoveryOrigin(normalizedBaseUrl);
  if (!discoveryOrigin) return null;
  const cachedApiBaseUrl = loadSessionCachedNoasApiBaseUrl(discoveryOrigin);

  if (cachedApiBaseUrl) {
    nostrDevLog("noas", "Using in-session cached NoaS API base URL", {
      submittedBaseUrl: normalizedBaseUrl,
      apiBaseUrl: cachedApiBaseUrl,
    });
    return {
      discoveryOrigin,
      discoveredApiBaseUrl: cachedApiBaseUrl,
    };
  }

  const response = await fetch(`${discoveryOrigin}/.well-known/nostr.json`, {
    headers: {
      Accept: "application/nostr+json, application/json",
    },
  });

  if (!response.ok) {
    nostrDevLog("noas", "NoaS API base discovery returned a non-OK response", {
      submittedBaseUrl: normalizedBaseUrl,
      discoveryOrigin,
      status: response.status,
    });
    return null;
  }

  const discoveryDocument = await response.json() as NoasDiscoveryDocument;
  const discoveredApiBaseUrl = resolveDiscoveredNoasApiBaseUrl(
    discoveryOrigin,
    discoveryDocument.noas?.api_base
  );

  if (!isValidNoasBaseUrl(discoveredApiBaseUrl)) {
    nostrDevLog("noas", "NoaS API base discovery missing a valid api_base entry", {
      submittedBaseUrl: normalizedBaseUrl,
      discoveryOrigin,
      discoveredApiBase: discoveryDocument.noas?.api_base,
    });
    return null;
  }

  cacheNoasApiBaseUrlInSession(discoveryOrigin, discoveredApiBaseUrl);
  nostrDevLog("noas", "Discovered NoaS API base URL", {
    submittedBaseUrl: normalizedBaseUrl,
    discoveryOrigin,
    apiBaseUrl: discoveredApiBaseUrl,
  });
  return {
    discoveryOrigin,
    discoveredApiBaseUrl,
  };
}

export async function resolveNoasApiBaseUrl(rawValue: string): Promise<string> {
  const normalizedBaseUrl = normalizeNoasBaseUrl(rawValue);
  if (!normalizedBaseUrl || !isValidNoasBaseUrl(normalizedBaseUrl)) return normalizedBaseUrl;
  const fallbackApiBaseUrl = resolveFallbackNoasApiBaseUrl(normalizedBaseUrl);

  try {
    const discovery = await discoverNoasApiBaseUrl(normalizedBaseUrl);
    if (discovery) {
      return discovery.discoveredApiBaseUrl;
    }
    return fallbackApiBaseUrl;
  } catch (error) {
    const discoveryOrigin = resolveNoasDiscoveryOrigin(normalizedBaseUrl);
    nostrDevLog("noas", "NoaS API base discovery failed, falling back to submitted host", {
      submittedBaseUrl: normalizedBaseUrl,
      fallbackApiBaseUrl,
      discoveryOrigin,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallbackApiBaseUrl;
  }
}
