export type PinnedEntityEntry<IdKey extends string> = {
  [K in IdKey]: string;
} & {
  pinnedAt: string;
  order: number;
};

export interface PinnedEntityState<IdKey extends string> {
  byRelay: Partial<Record<string, PinnedEntityEntry<IdKey>[]>>;
}

export function createEmptyPinnedEntityState<IdKey extends string>(): PinnedEntityState<IdKey> {
  return { byRelay: {} };
}

export function getPinnedEntityIdsForRelays<IdKey extends string>(
  state: PinnedEntityState<IdKey>,
  relayIds: string[],
  idKey: IdKey
): string[] {
  const minOrderById = new Map<string, number>();
  for (const relayId of relayIds) {
    for (const entry of state.byRelay[relayId] ?? []) {
      const entityId = entry[idKey];
      const current = minOrderById.get(entityId);
      if (current === undefined || entry.order < current) {
        minOrderById.set(entityId, entry.order);
      }
    }
  }
  return Array.from(minOrderById.entries())
    .sort(([idA, orderA], [idB, orderB]) => orderA - orderB || idA.localeCompare(idB))
    .map(([id]) => id);
}

export function isPinnedEntityForAnyRelay<IdKey extends string>(
  state: PinnedEntityState<IdKey>,
  relayIds: string[],
  entityId: string,
  idKey: IdKey
): boolean {
  return relayIds.some((relayId) =>
    (state.byRelay[relayId] ?? []).some((entry) => entry[idKey] === entityId)
  );
}

export function pinEntityForRelays<IdKey extends string>(
  state: PinnedEntityState<IdKey>,
  relayIds: string[],
  entityId: string,
  idKey: IdKey
): PinnedEntityState<IdKey> {
  let next = state;
  for (const relayId of relayIds) {
    const entries = next.byRelay[relayId] ?? [];
    if (entries.some((entry) => entry[idKey] === entityId)) continue;
    const maxOrder = entries.length > 0 ? Math.max(...entries.map((entry) => entry.order)) : -1;
    const pinnedAt = new Date().toISOString();
    const newEntry = { [idKey]: entityId, pinnedAt, order: maxOrder + 1 } as PinnedEntityEntry<IdKey>;
    next = {
      ...next,
      byRelay: {
        ...next.byRelay,
        [relayId]: [...entries, newEntry],
      },
    };
  }
  return next;
}

export function unpinEntityFromRelays<IdKey extends string>(
  state: PinnedEntityState<IdKey>,
  relayIds: string[],
  entityId: string,
  idKey: IdKey
): PinnedEntityState<IdKey> {
  let next = state;
  for (const relayId of relayIds) {
    const entries = next.byRelay[relayId] ?? [];
    if (!entries.some((entry) => entry[idKey] === entityId)) continue;
    next = {
      ...next,
      byRelay: {
        ...next.byRelay,
        [relayId]: entries.filter((entry) => entry[idKey] !== entityId),
      },
    };
  }
  return next;
}
