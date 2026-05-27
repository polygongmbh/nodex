import { beforeEach, describe, expect, it } from "vitest";
import {
  createNdkMetadataCacheAdapter,
  forgetCachedRelayNip11,
  loadCachedRelayNip11,
  saveCachedRelayNip11,
  RELAY_NIP11_CACHE_TTL_MS,
} from "./ndk-metadata-cache-adapter";
import { RELAY_STATUS_CACHE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";

describe("createNdkMetadataCacheAdapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and loads normalized relay NIP-11 status", async () => {
    const adapter = createNdkMetadataCacheAdapter();
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
    expect(cached?.nip11?.data).toEqual({
      supported_nips: [42],
      limitation: { auth_required: true },
    });
  });

  it("keeps existing nip11 cache when ndk updates transport-only relay metadata", async () => {
    const adapter = createNdkMetadataCacheAdapter();
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
    const adapter = createNdkMetadataCacheAdapter();

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

describe("loadCachedRelayNip11", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns the persisted document for a fresh entry", () => {
    saveCachedRelayNip11("wss://relay.one", {
      name: "Relay One",
      supported_nips: [42],
      limitation: { auth_required: true },
    });

    expect(loadCachedRelayNip11("wss://relay.one/")).toEqual({
      name: "Relay One",
      supported_nips: [42],
      limitation: { auth_required: true },
    });
  });

  it("returns null when the entry is older than the ttl", () => {
    saveCachedRelayNip11("wss://relay.one", { name: "Relay One" });

    const past = Date.now() + RELAY_NIP11_CACHE_TTL_MS + 1;
    expect(loadCachedRelayNip11("wss://relay.one", { now: past })).toBeNull();
  });
});

describe("forgetCachedRelayNip11", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("drops the persisted entry for the relay", () => {
    saveCachedRelayNip11("wss://relay.one", { name: "Relay One" });
    expect(loadCachedRelayNip11("wss://relay.one")).not.toBeNull();

    forgetCachedRelayNip11("wss://relay.one/");

    expect(loadCachedRelayNip11("wss://relay.one")).toBeNull();
  });
});
