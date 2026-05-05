import {
  getConfiguredDefaultRelays,
  getConfiguredDefaultRelaysWithFallback,
} from "@/infrastructure/nostr/default-relays";
import { loadPersistedRelayUrls, savePersistedRelayUrls } from "@/infrastructure/nostr/provider/storage";
import { clearAllCachedNostrEvents } from "@/infrastructure/nostr/event-cache";

export interface StartupRelayBootstrap {
  relayUrls: string[];
  source: "path-override" | "persisted" | "env" | "fallback";
  needsAsyncFallback: boolean;
}

export interface ReadStartupRelayBootstrapOptions {
  pathRelayOverride?: string | null;
}

/**
 * Extracts a relay URL from a pathname like `/relay.example.com` (only when the
 * first path segment looks like a hostname, i.e. contains a `.`).
 * Returns `null` for normal app routes (`/feed`, `/tree`, ...).
 */
export function extractPathRelayOverride(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment || !segment.includes(".")) return null;
  try {
    const candidate = `wss://${segment}`;
    const parsed = new URL(candidate);
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    return candidate;
  } catch {
    return null;
  }
}

export function readStartupRelayBootstrap(
  options?: ReadStartupRelayBootstrapOptions
): StartupRelayBootstrap {
  const pathRelayOverride = options?.pathRelayOverride ?? null;
  if (pathRelayOverride) {
    const previouslyPersisted = loadPersistedRelayUrls() ?? [];
    const isSameSoleRelay =
      previouslyPersisted.length === 1 && previouslyPersisted[0] === pathRelayOverride;
    if (!isSameSoleRelay) {
      // Discard cached events from any other relays so the path-scoped session
      // only renders content from the requested relay.
      clearAllCachedNostrEvents();
    }
    savePersistedRelayUrls([pathRelayOverride]);
    return {
      relayUrls: [pathRelayOverride],
      source: "path-override",
      needsAsyncFallback: false,
    };
  }

  const persistedRelayUrls = loadPersistedRelayUrls();
  if (persistedRelayUrls && persistedRelayUrls.length > 0) {
    return {
      relayUrls: persistedRelayUrls,
      source: "persisted",
      needsAsyncFallback: false,
    };
  }

  const configuredRelayUrls = getConfiguredDefaultRelays();
  if (configuredRelayUrls.length > 0) {
    return {
      relayUrls: configuredRelayUrls,
      source: "env",
      needsAsyncFallback: false,
    };
  }

  return {
    relayUrls: [],
    source: "fallback",
    needsAsyncFallback: true,
  };
}

export async function resolveStartupRelayBootstrap(
  options?: ReadStartupRelayBootstrapOptions
): Promise<StartupRelayBootstrap> {
  const bootstrap = readStartupRelayBootstrap(options);
  if (!bootstrap.needsAsyncFallback) return bootstrap;

  const discoveredRelayUrls = await getConfiguredDefaultRelaysWithFallback();
  if (discoveredRelayUrls.length > 0) {
    savePersistedRelayUrls(discoveredRelayUrls);
  }

  return {
    relayUrls: discoveredRelayUrls,
    source: "fallback",
    needsAsyncFallback: false,
  };
}
