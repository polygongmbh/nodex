import { beforeEach, describe, expect, it } from "vitest";
import {
  createNodexCacheAdapter,
  getFreshRelayInfoSummaryFromCache,
  RELAY_NIP11_CACHE_TTL_MS,
} from "./ndk-cache-adapter";
import { RELAY_STATUS_CACHE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

describe("createNodexCacheAdapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and loads normalized relay NIP-11 status", async () => {
    const adapter = createNodexCacheAdapter();
    const fetchedAt = 1234;

    await adapter.updateRelayStatus?.("wss://relay.one/", {
      nip11: {
        data: {
          supported_nips: [42],
          limitation: { auth_required: true },
        },
        fetchedAt,
      },
    });

    const raw = window.localStorage.getItem(RELAY_STATUS_CACHE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
    expect(parsed["wss://relay.one"]).toBeTruthy();

    const cached = await adapter.getRelayStatus?.("wss://relay.one");
    expect(cached?.nip11?.fetchedAt).toBe(fetchedAt);
    const summary = getFreshRelayInfoSummaryFromCache(cached, {
      now: fetchedAt + 1,
      maxAgeMs: RELAY_NIP11_CACHE_TTL_MS,
    });
    expect(summary).toEqual({
      summary: {
        authRequired: true,
        supportsNip42: true,
      },
      fetchedAt,
    });
  });

  it("keeps existing nip11 cache when ndk updates transport-only relay metadata", async () => {
    const adapter = createNodexCacheAdapter();
    const fetchedAt = Date.now();

    await adapter.updateRelayStatus?.("wss://relay.one", {
      nip11: {
        data: {
          supported_nips: [42],
          limitation: { auth_required: true },
        },
        fetchedAt,
      },
    });

    await adapter.updateRelayStatus?.("wss://relay.one", {
      lastConnectedAt: Date.now(),
      consecutiveFailures: 0,
    });

    const cached = await adapter.getRelayStatus?.("wss://relay.one");
    expect(cached?.nip11?.fetchedAt).toBe(fetchedAt);
  });

  it("clears a relay cache entry when updateRelayStatus receives an empty payload", async () => {
    const adapter = createNodexCacheAdapter();

    await adapter.updateRelayStatus?.("wss://relay.one", {
      nip11: {
        data: {
          supported_nips: [42],
          limitation: { auth_required: true },
        },
        fetchedAt: Date.now(),
      },
    });

    await adapter.updateRelayStatus?.("wss://relay.one", {});

    const cached = await adapter.getRelayStatus?.("wss://relay.one");
    expect(cached).toBeUndefined();
  });
});

describe("getFreshRelayInfoSummaryFromCache", () => {
  it("returns null when cache entry is older than ttl", () => {
    const staleFetchedAt = 1000;
    const stale = getFreshRelayInfoSummaryFromCache({
      nip11: {
        fetchedAt: staleFetchedAt,
        data: {
          limitation: { auth_required: true },
          supported_nips: [42],
        },
      },
    }, {
      now: staleFetchedAt + RELAY_NIP11_CACHE_TTL_MS + 1,
      maxAgeMs: RELAY_NIP11_CACHE_TTL_MS,
    });
    expect(stale).toBeNull();
  });
});
