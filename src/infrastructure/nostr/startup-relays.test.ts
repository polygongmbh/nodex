import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractPathRelayOverride,
  readStartupRelayBootstrap,
  resolveStartupRelayBootstrap,
} from "./startup-relays";

const defaultRelaysModule = vi.hoisted(() => ({
  getConfiguredDefaultRelays: vi.fn<() => string[]>(),
  getConfiguredDefaultRelaysWithFallback: vi.fn<() => Promise<string[]>>(),
}));

const storageModule = vi.hoisted(() => ({
  loadPersistedRelayUrls: vi.fn<() => string[] | null>(),
  savePersistedRelayUrls: vi.fn<(urls: string[]) => void>(),
}));

vi.mock("@/infrastructure/nostr/default-relays", () => defaultRelaysModule);
vi.mock("@/infrastructure/nostr/provider/storage", () => storageModule);

describe("startup relay bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageModule.loadPersistedRelayUrls.mockReturnValue(null);
    defaultRelaysModule.getConfiguredDefaultRelays.mockReturnValue([]);
    defaultRelaysModule.getConfiguredDefaultRelaysWithFallback.mockResolvedValue([]);
  });

  it("uses persisted relays without fallback resolution", () => {
    storageModule.loadPersistedRelayUrls.mockReturnValue(["wss://relay.persisted"]);

    expect(readStartupRelayBootstrap()).toEqual({
      relayUrls: ["wss://relay.persisted"],
      source: "persisted",
      needsAsyncFallback: false,
    });
    expect(defaultRelaysModule.getConfiguredDefaultRelays).not.toHaveBeenCalled();
  });

  it("uses env relays without fallback resolution when no persisted relays exist", () => {
    defaultRelaysModule.getConfiguredDefaultRelays.mockReturnValue(["wss://relay.env"]);

    expect(readStartupRelayBootstrap()).toEqual({
      relayUrls: ["wss://relay.env"],
      source: "env",
      needsAsyncFallback: false,
    });
  });

  it("marks fallback resolution as pending when neither persisted nor env relays exist", () => {
    expect(readStartupRelayBootstrap()).toEqual({
      relayUrls: [],
      source: "fallback",
      needsAsyncFallback: true,
    });
  });

  it("resolves and persists host fallback relays when discovery succeeds", async () => {
    defaultRelaysModule.getConfiguredDefaultRelaysWithFallback.mockResolvedValue(["wss://relay.host"]);

    await expect(resolveStartupRelayBootstrap()).resolves.toEqual({
      relayUrls: ["wss://relay.host"],
      source: "fallback",
      needsAsyncFallback: false,
    });
    expect(storageModule.savePersistedRelayUrls).toHaveBeenCalledWith(["wss://relay.host"]);
  });

  it("does not persist fallback relays when discovery finds none", async () => {
    await expect(resolveStartupRelayBootstrap()).resolves.toEqual({
      relayUrls: [],
      source: "fallback",
      needsAsyncFallback: false,
    });
    expect(storageModule.savePersistedRelayUrls).not.toHaveBeenCalled();
  });

  it("uses a path-derived relay override and persists it, ignoring persisted/env relays", () => {
    storageModule.loadPersistedRelayUrls.mockReturnValue(["wss://relay.persisted"]);
    defaultRelaysModule.getConfiguredDefaultRelays.mockReturnValue(["wss://relay.env"]);

    expect(
      readStartupRelayBootstrap({ pathRelayOverride: "wss://relay.example.com" })
    ).toEqual({
      relayUrls: ["wss://relay.example.com"],
      source: "path-override",
      needsAsyncFallback: false,
    });
    expect(storageModule.savePersistedRelayUrls).toHaveBeenCalledWith(["wss://relay.example.com"]);
    expect(storageModule.loadPersistedRelayUrls).not.toHaveBeenCalled();
    expect(defaultRelaysModule.getConfiguredDefaultRelays).not.toHaveBeenCalled();
  });
});

describe("extractPathRelayOverride", () => {
  it("extracts a relay URL from a hostname-like first path segment", () => {
    expect(extractPathRelayOverride("/relay.example.com")).toBe("wss://relay.example.com");
    expect(extractPathRelayOverride("/relay.example.com/")).toBe("wss://relay.example.com");
  });

  it("returns null for normal app routes", () => {
    expect(extractPathRelayOverride("/")).toBeNull();
    expect(extractPathRelayOverride("/feed")).toBeNull();
    expect(extractPathRelayOverride("/tree")).toBeNull();
    expect(extractPathRelayOverride("/manage")).toBeNull();
    expect(extractPathRelayOverride("/feed/abc123")).toBeNull();
  });
});
