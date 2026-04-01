import { discoverNoasApiBaseUrl, normalizeNoasBaseUrl } from "@/lib/nostr/noas-client";
import { loadPersistedNoasDefaultHostUrl, savePersistedNoasDefaultHostUrl } from "@/infrastructure/nostr/provider/storage";
import { nostrDevLog } from "@/lib/nostr/dev-logs";
import { resolveRootDomainHostname } from "@/lib/root-domain";

export interface StartupNoasBootstrap {
  defaultHostUrl: string;
  source: "persisted" | "env" | "fallback";
  needsAsyncFallback: boolean;
}

function resolveConfiguredNoasHostUrl(): string {
  return normalizeNoasBaseUrl(
    (import.meta.env.VITE_NOAS_HOST_URL as string | undefined) || ""
  );
}

function resolveRootDomainHostUrl(): string {
  if (typeof window === "undefined" || !window.location.hostname) return "";
  const rootHostname = resolveRootDomainHostname(window.location.hostname);
  if (!rootHostname) return "";
  return normalizeNoasBaseUrl(`${window.location.protocol}//${rootHostname}`);
}

export function readStartupNoasBootstrap(): StartupNoasBootstrap {
  const configuredNoasHostUrl = resolveConfiguredNoasHostUrl();
  if (configuredNoasHostUrl) {
    return {
      defaultHostUrl: configuredNoasHostUrl,
      source: "env",
      needsAsyncFallback: false,
    };
  }

  const persistedNoasHostUrl = loadPersistedNoasDefaultHostUrl();
  if (persistedNoasHostUrl) {
    return {
      defaultHostUrl: persistedNoasHostUrl,
      source: "persisted",
      needsAsyncFallback: false,
    };
  }

  return {
    defaultHostUrl: "",
    source: "fallback",
    needsAsyncFallback: true,
  };
}

export async function resolveStartupNoasBootstrap(): Promise<StartupNoasBootstrap> {
  const bootstrap = readStartupNoasBootstrap();
  if (!bootstrap.needsAsyncFallback) return bootstrap;

  const rootDomainHostUrl = resolveRootDomainHostUrl();
  if (!rootDomainHostUrl) {
    return {
      defaultHostUrl: "",
      source: "fallback",
      needsAsyncFallback: false,
    };
  }

  nostrDevLog("noas", "Resolving startup NoaS host from current site domain", {
    hostname: typeof window !== "undefined" ? window.location.hostname : "",
    rootDomainHostUrl,
  });

  try {
    const discovery = await discoverNoasApiBaseUrl(rootDomainHostUrl);
    if (!discovery) {
      nostrDevLog("noas", "Startup NoaS host discovery found no valid noas.api_base", {
        rootDomainHostUrl,
      });
      return {
        defaultHostUrl: "",
        source: "fallback",
        needsAsyncFallback: false,
      };
    }

    savePersistedNoasDefaultHostUrl(rootDomainHostUrl);
    return {
      defaultHostUrl: rootDomainHostUrl,
      source: "fallback",
      needsAsyncFallback: false,
    };
  } catch (error) {
    nostrDevLog("noas", "Startup NoaS host discovery failed", {
      rootDomainHostUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      defaultHostUrl: "",
      source: "fallback",
      needsAsyncFallback: false,
    };
  }
}
