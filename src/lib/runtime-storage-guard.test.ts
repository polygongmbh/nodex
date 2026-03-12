import { describe, expect, it } from "vitest";
import {
  PERSISTENCE_BLOCK_QUERY_PARAM,
  installClientPersistenceBlockers,
  resetClientPersistenceGuardForTests,
  shouldBlockClientPersistence,
} from "./runtime-storage-guard";

function createMemoryStorage(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return Array.from(state.keys())[index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, String(value));
    },
  };
}

describe("runtime storage guard", () => {
  it("enables the guard when nodexNoStorage query param is truthy", () => {
    expect(shouldBlockClientPersistence(`?${PERSISTENCE_BLOCK_QUERY_PARAM}=1`)).toBe(true);
    expect(shouldBlockClientPersistence(`?${PERSISTENCE_BLOCK_QUERY_PARAM}=true`)).toBe(true);
    expect(shouldBlockClientPersistence(`?${PERSISTENCE_BLOCK_QUERY_PARAM}=0`)).toBe(false);
    expect(shouldBlockClientPersistence("")).toBe(false);
  });

  it("falls back to env control when query param is absent", () => {
    expect(shouldBlockClientPersistence("", { VITE_DISABLE_CLIENT_PERSISTENCE: "true" })).toBe(true);
    expect(shouldBlockClientPersistence("", { VITE_DISABLE_CLIENT_PERSISTENCE: "false" })).toBe(false);
  });

  it("replaces browser persistence surfaces with no-op shims", async () => {
    const localStorage = createMemoryStorage();
    const sessionStorage = createMemoryStorage();
    const fakeWindow = {
      localStorage,
      sessionStorage,
      caches: {
        delete: async () => true,
        has: async () => true,
        keys: async () => ["seed"],
        match: async () => ({} as Cache),
        open: async () => ({} as Cache),
      },
      indexedDB: { open: () => ({}) },
    } as unknown as Window & typeof globalThis;
    const fakeDocument = { cookie: "" } as Document;

    resetClientPersistenceGuardForTests();
    const installed = installClientPersistenceBlockers(fakeWindow, fakeDocument);

    expect(installed).toBe(true);
    fakeWindow.localStorage.setItem("alpha", "1");
    fakeWindow.sessionStorage.setItem("beta", "2");
    expect(fakeWindow.localStorage.getItem("alpha")).toBeNull();
    expect(fakeWindow.sessionStorage.getItem("beta")).toBeNull();

    fakeDocument.cookie = "foo=bar";
    expect(fakeDocument.cookie).toBe("");

    await expect(fakeWindow.caches.open("x")).rejects.toThrow("disabled via nodexNoStorage");
    expect(fakeWindow.indexedDB).toBeUndefined();
  });
});
