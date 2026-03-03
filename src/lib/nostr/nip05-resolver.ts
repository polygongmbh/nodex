const STORAGE_KEY = "nodex.nip05-resolver.cache.v1";
const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 3000;
const PUBKEY_PATTERN = /^[a-f0-9]{64}$/i;
const NIP05_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

interface CachedNip05Resolution {
  pubkey: string | null;
  expiresAt: number;
}

const inMemoryCache = new Map<string, CachedNip05Resolution>();

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function loadPersistentCache(): Record<string, CachedNip05Resolution> {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedNip05Resolution>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function savePersistentCache(cache: Record<string, CachedNip05Resolution>): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage persistence failures.
  }
}

function readCachedResolution(identifier: string): string | null | undefined {
  const now = Date.now();
  const memory = inMemoryCache.get(identifier);
  if (memory && memory.expiresAt > now) {
    return memory.pubkey;
  }
  if (memory && memory.expiresAt <= now) {
    inMemoryCache.delete(identifier);
  }

  const persisted = loadPersistentCache()[identifier];
  if (!persisted) return undefined;
  if (persisted.expiresAt <= now) {
    const next = loadPersistentCache();
    delete next[identifier];
    savePersistentCache(next);
    return undefined;
  }
  inMemoryCache.set(identifier, persisted);
  return persisted.pubkey;
}

function cacheResolution(identifier: string, pubkey: string | null): void {
  const expiresAt = Date.now() + (pubkey ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
  const payload: CachedNip05Resolution = { pubkey, expiresAt };
  inMemoryCache.set(identifier, payload);
  const persisted = loadPersistentCache();
  persisted[identifier] = payload;
  savePersistentCache(persisted);
}

export function clearNip05ResolutionCache(): void {
  inMemoryCache.clear();
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage persistence failures.
  }
}

export async function resolveNip05Identifier(identifier: string): Promise<string | null> {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  if (!NIP05_PATTERN.test(normalizedIdentifier)) return null;

  const cached = readCachedResolution(normalizedIdentifier);
  if (cached !== undefined) return cached;

  const [name, domain] = normalizedIdentifier.split("@");
  if (!name || !domain) return null;

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
      { signal: controller.signal }
    );
    if (!response.ok) {
      cacheResolution(normalizedIdentifier, null);
      return null;
    }
    const payload = await response.json() as { names?: Record<string, string> };
    const candidate = (payload?.names?.[name] || payload?.names?.[name.toLowerCase()] || "").trim().toLowerCase();
    if (!PUBKEY_PATTERN.test(candidate)) {
      cacheResolution(normalizedIdentifier, null);
      return null;
    }
    cacheResolution(normalizedIdentifier, candidate);
    return candidate;
  } catch {
    cacheResolution(normalizedIdentifier, null);
    return null;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
