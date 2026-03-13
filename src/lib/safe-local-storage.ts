const warnedStorageFailures = new Set<string>();

function getErrorName(error: unknown): string {
  if (error instanceof DOMException && error.name) return error.name;
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.trim().length > 0) return name;
  }
  return "UnknownStorageError";
}

function resolveLocalStorage(storage?: Storage | null): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

export function safeLocalStorageSetItem(
  storageKey: string,
  value: string,
  options?: { storage?: Storage | null; context?: string }
): boolean {
  const storage = resolveLocalStorage(options?.storage);
  if (!storage) return false;

  try {
    storage.setItem(storageKey, value);
    return true;
  } catch (error) {
    const errorName = getErrorName(error);
    const dedupeKey = `${storageKey}:${errorName}`;
    if (!warnedStorageFailures.has(dedupeKey)) {
      warnedStorageFailures.add(dedupeKey);
      console.warn("localStorage write failed", {
        storageKey,
        context: options?.context || "unknown",
        errorName,
      });
    }
    return false;
  }
}

export function resetSafeLocalStorageWarningsForTests(): void {
  warnedStorageFailures.clear();
}
