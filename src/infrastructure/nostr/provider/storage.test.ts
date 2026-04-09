import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionNoasState,
  clearSessionPrivateKey,
  clearStoredAuthMethod,
  loadSessionNoasState,
  loadSessionPrivateKey,
  loadStoredAuthMethod,
  loadPersistedNoasDefaultHostUrl,
  loadPersistedRelayUrls,
  savePersistentAuthMethod,
  savePersistedNoasDefaultHostUrl,
  saveSessionAuthMethod,
  saveSessionNoasState,
  saveSessionPrivateKey,
  STORAGE_KEY_AUTH,
  STORAGE_KEY_NOAS_DEFAULT_HOST,
  STORAGE_KEY_SESSION_NOAS_STATE,
  STORAGE_KEY_SESSION_PRIVATE_KEY,
  savePersistedRelayUrls,
  STORAGE_KEY_RELAYS,
} from "./storage";

describe("relay list persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    expect(() => savePersistedRelayUrls(["wss://relay.one"])).not.toThrow();

    setItemSpy.mockRestore();
  });

  it("normalizes a persisted Noas default host URL", () => {
    savePersistedNoasDefaultHostUrl("example.com///");

    expect(loadPersistedNoasDefaultHostUrl()).toBe("https://example.com");
  });

  it("returns an empty Noas default host when none is stored", () => {
    expect(loadPersistedNoasDefaultHostUrl()).toBe("");
  });

  it("returns an empty Noas default host for malformed persisted values", () => {
    window.localStorage.setItem(STORAGE_KEY_NOAS_DEFAULT_HOST, "://bad url");

    expect(loadPersistedNoasDefaultHostUrl()).toBe("");
  });

  it("prefers a session-scoped auth method over durable auth", () => {
    window.localStorage.setItem(STORAGE_KEY_AUTH, "guest");
    saveSessionAuthMethod("privateKey");

    expect(loadStoredAuthMethod()).toBe("privateKey");
  });

  it("stores private-key auth only in session storage", () => {
    saveSessionAuthMethod("privateKey");
    saveSessionPrivateKey("nsec1abc");

    expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY_AUTH)).toBe("privateKey");
    expect(loadSessionPrivateKey()).toBe("nsec1abc");
  });

  it("stores durable auth only in localStorage", () => {
    window.sessionStorage.setItem(STORAGE_KEY_AUTH, "privateKey");

    savePersistentAuthMethod("guest");

    expect(loadStoredAuthMethod()).toBe("guest");
    expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBe("guest");
    expect(window.sessionStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
  });

  it("round-trips normalized Noas session state from session storage", () => {
    saveSessionNoasState({
      apiBaseUrl: "noas.example///",
      username: "alice",
      relayUrls: ["wss://relay.one", "  ", "wss://relay.two"],
    });

    expect(loadSessionNoasState()).toEqual({
      apiBaseUrl: "https://noas.example",
      username: "alice",
      relayUrls: ["wss://relay.one", "wss://relay.two"],
    });
  });

  it("returns null for malformed Noas session payloads", () => {
    window.sessionStorage.setItem(STORAGE_KEY_SESSION_NOAS_STATE, JSON.stringify({ username: "alice" }));

    expect(loadSessionNoasState()).toBeNull();
  });

  it("clears auth data from both storage scopes", () => {
    window.localStorage.setItem(STORAGE_KEY_AUTH, "guest");
    window.sessionStorage.setItem(STORAGE_KEY_AUTH, "noas");
    window.sessionStorage.setItem(STORAGE_KEY_SESSION_PRIVATE_KEY, "nsec1abc");
    window.sessionStorage.setItem(STORAGE_KEY_SESSION_NOAS_STATE, JSON.stringify({
      apiBaseUrl: "https://noas.example",
      username: "alice",
    }));

    clearStoredAuthMethod();
    clearSessionPrivateKey();
    clearSessionNoasState();

    expect(loadStoredAuthMethod()).toBeNull();
    expect(loadSessionPrivateKey()).toBeNull();
    expect(loadSessionNoasState()).toBeNull();
  });
});
