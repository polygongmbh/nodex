import { z } from "zod";
import type {
  PinnedEntityState,
  ViewPinnedEntityEntry,
} from "@/domain/preferences/pinned-entity-state";

function buildPinnedEntityStateSchema(idKey: string) {
  const entryShape: z.ZodRawShape = {
    pinnedAt: z.string(),
    order: z.number().finite(),
  };
  entryShape[idKey] = z.string();

  return z.object({
    version: z.literal(2),
    updatedAt: z.string(),
    byView: z.record(
      z.string(),
      z.record(z.string(), z.array(z.object(entryShape)).optional()).optional()
    ),
  });
}

function storageKey(namespace: string, pubkey?: string): string {
  const prefix = pubkey ? pubkey.slice(0, 8) : "guest";
  return `nodex.${namespace}.${prefix}.v2`;
}

function stripInvalidEntries<IdKey extends string>(
  rawState: PinnedEntityState<IdKey>,
  idKey: IdKey
): PinnedEntityState<IdKey>["byView"] {
  const byView: PinnedEntityState<IdKey>["byView"] = {};
  for (const [view, byRelay] of Object.entries(rawState.byView)) {
    if (!byRelay) continue;
    const cleanedByRelay: Partial<Record<string, ViewPinnedEntityEntry<IdKey>[]>> = {};
    for (const [relayId, entries] of Object.entries(byRelay)) {
      if (!entries) continue;
      const valid = entries.filter((entry) => entry[idKey].trim() !== "");
      if (valid.length > 0) cleanedByRelay[relayId] = valid;
    }
    if (Object.keys(cleanedByRelay).length > 0) byView[view] = cleanedByRelay;
  }
  return byView;
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
    const parsed = buildPinnedEntityStateSchema(idKey).safeParse(JSON.parse(raw));
    if (!parsed.success) return createEmptyState();
    const validData = parsed.data as PinnedEntityState<IdKey>;
    return {
      version: 2,
      updatedAt: validData.updatedAt,
      byView: stripInvalidEntries(validData, idKey),
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
