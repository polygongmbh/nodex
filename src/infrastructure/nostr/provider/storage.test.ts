import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadPersistedRelayUrls,
  savePersistedRelayUrls,
  STORAGE_KEY_RELAYS,
} from "./storage";

describe("relay list persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when no persisted relay list exists", () => {
    expect(loadPersistedRelayUrls()).toBeNull();
  });

  it("normalizes and deduplicates persisted relay URLs", () => {
    savePersistedRelayUrls([
      "wss://relay.one/",
      "wss://relay.one",
      "wss://relay.two///",
    ]);

    expect(loadPersistedRelayUrls()).toEqual([
      "wss://relay.one",
      "wss://relay.two",
    ]);
  });

  it("returns empty list for malformed persisted data", () => {
    window.localStorage.setItem(STORAGE_KEY_RELAYS, "{bad json");
    expect(loadPersistedRelayUrls()).toEqual([]);
  });

  it("does not throw when localStorage quota is exceeded while saving relays", () => {
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => savePersistedRelayUrls(["wss://relay.one"])).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    setItemSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
