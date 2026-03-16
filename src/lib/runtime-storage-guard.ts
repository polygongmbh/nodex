import { featureDebugLog } from "@/lib/feature-debug";

export const PERSISTENCE_BLOCK_QUERY_PARAM = "nodexNoStorage";

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

let blockersInstalled = false;

function isTruthyParamValue(value: string | null): boolean {
  if (!value) return false;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
}

function createNoopStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear() {},
    getItem() {
      return null;
    },
    key() {
      return null;
    },
    removeItem() {},
    setItem() {},
  };
}

function setGlobalProperty(target: object, key: PropertyKey, value: unknown): void {
  try {
    Object.defineProperty(target, key, {
      configurable: true,
      writable: true,
      value,
    });
    return;
  } catch {
    // Fall back to assignment when defineProperty is blocked.
  }
  try {
    (target as Record<PropertyKey, unknown>)[key] = value;
  } catch {
    // Ignore failed overrides.
  }
}

function installCookieBlock(documentObject: Document): void {
  try {
    Object.defineProperty(documentObject, "cookie", {
      configurable: true,
      get() {
        return "";
      },
      set() {
        // Ignore cookie writes when persistence is blocked.
      },
    });
  } catch {
    // Ignore failed cookie override.
  }
}

function createBlockedCachesApi(): CacheStorage {
  const blocked = async () => {
    throw new Error("CacheStorage is disabled via nodexNoStorage policy");
  };
  return {
    delete: async () => false,
    has: async () => false,
    keys: async () => [],
    match: async () => undefined,
    open: blocked,
  } as CacheStorage;
}

export function shouldBlockClientPersistence(search: string, env: Record<string, unknown> = {}): boolean {
  const queryValue = new URLSearchParams(search).get(PERSISTENCE_BLOCK_QUERY_PARAM);
  if (isTruthyParamValue(queryValue)) return true;
  return String(env.VITE_DISABLE_CLIENT_PERSISTENCE || "").toLowerCase() === "true";
}

export function installClientPersistenceBlockers(
  windowObject: Window & typeof globalThis = window,
  documentObject: Document = document
): boolean {
  if (blockersInstalled) return false;
  blockersInstalled = true;

  const noopStorage = createNoopStorage();
  setGlobalProperty(windowObject, "localStorage", noopStorage);
  setGlobalProperty(windowObject, "sessionStorage", noopStorage);
  setGlobalProperty(windowObject, "caches", createBlockedCachesApi());
  setGlobalProperty(windowObject, "indexedDB", undefined);
  installCookieBlock(documentObject);
  return true;
}

export function resetClientPersistenceGuardForTests(): void {
  blockersInstalled = false;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const blocked = shouldBlockClientPersistence(window.location.search, import.meta.env as Record<string, unknown>);
  if (blocked) {
    const installed = installClientPersistenceBlockers(window, document);
    if (installed) {
      featureDebugLog("persistence", "Client persistence disabled via runtime policy", {
        queryParam: PERSISTENCE_BLOCK_QUERY_PARAM,
      });
    }
  }
}
