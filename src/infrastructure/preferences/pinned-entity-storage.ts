import type {
  PinnedEntityEntry,
  PinnedEntityState,
} from "@/domain/preferences/pinned-entity-state";

function storageKey(namespace: string, pubkey?: string): string {
  const prefix = pubkey ? pubkey.slice(0, 8) : "guest";
  return `nodex.${namespace}.${prefix}`;
}

function stripInvalidEntries<IdKey extends string>(
  rawByRelay: unknown,
  idKey: IdKey
): PinnedEntityState<IdKey>["byRelay"] {
  const byRelay: PinnedEntityState<IdKey>["byRelay"] = {};
  if (!rawByRelay || typeof rawByRelay !== "object") return byRelay;

  for (const [relayId, entries] of Object.entries(rawByRelay)) {
    if (!Array.isArray(entries)) continue;
    const valid = entries.filter((entry): entry is PinnedEntityEntry<IdKey> => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Record<string, unknown>;
      return (
        typeof candidate[idKey] === "string" &&
        candidate[idKey].trim() !== "" &&
        typeof candidate.pinnedAt === "string" &&
        typeof candidate.order === "number" &&
        Number.isFinite(candidate.order)
      );
    });
    if (valid.length > 0) {
      byRelay[relayId] = valid.map((entry) => ({
        [idKey]: entry[idKey].trim(),
        pinnedAt: entry.pinnedAt,
        order: entry.order,
      })) as PinnedEntityEntry<IdKey>[];
    }
  }
  return byRelay;
}

export function loadPinnedEntityState<IdKey extends string>(params: {
  namespace: string;
  idKey: IdKey;
  pubkey?: string;
  createEmptyState: () => PinnedEntityState<IdKey>;
}): PinnedEntityState<IdKey> {
  const { namespace, idKey, pubkey, createEmptyState } = params;
  try {
    const raw = localStorage.getItem(storageKey(namespace, pubkey));
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw) as { byRelay?: unknown };
    return {
      byRelay: stripInvalidEntries(parsed.byRelay, idKey),
    };
  } catch {
    return createEmptyState();
  }
}

export function savePinnedEntityState<IdKey extends string>(params: {
  namespace: string;
  state: PinnedEntityState<IdKey>;
  pubkey?: string;
}): void {
  const { namespace, state, pubkey } = params;
  try {
    localStorage.setItem(storageKey(namespace, pubkey), JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}
