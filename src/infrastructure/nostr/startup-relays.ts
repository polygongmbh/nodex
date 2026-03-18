import {
  getConfiguredDefaultRelays,
  getConfiguredDefaultRelaysWithFallback,
} from "@/infrastructure/nostr/default-relays";
import { loadPersistedRelayUrls, savePersistedRelayUrls } from "@/infrastructure/nostr/provider/storage";

export interface StartupRelayBootstrap {
  relayUrls: string[];
  source: "persisted" | "env" | "fallback";
  needsAsyncFallback: boolean;
}

export function readStartupRelayBootstrap(): StartupRelayBootstrap {
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

export async function resolveStartupRelayBootstrap(): Promise<StartupRelayBootstrap> {
  const bootstrap = readStartupRelayBootstrap();
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
