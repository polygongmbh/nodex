export type ViewPinnedEntityEntry<IdKey extends string> = {
  [K in IdKey]: string;
} & {
  pinnedAt: string;
  order: number;
};

export interface PinnedEntityState<IdKey extends string> {
  version: 2;
  updatedAt: string;
  byView: Partial<Record<string, Partial<Record<string, ViewPinnedEntityEntry<IdKey>[]>>>>;
}

export function createEmptyPinnedEntityState<IdKey extends string>(): PinnedEntityState<IdKey> {
  return { version: 2, updatedAt: "", byView: {} };
}

export function getPinnedEntityIdsForView<IdKey extends string>(
  state: PinnedEntityState<IdKey>,
  view: string,
  relayIds: string[],
  idKey: IdKey
): string[] {
  const minOrderById = new Map<string, number>();
  for (const relayId of relayIds) {
    for (const entry of state.byView[view]?.[relayId] ?? []) {
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
  view: string,
  relayIds: string[],
  entityId: string,
  idKey: IdKey
): boolean {
  return relayIds.some((relayId) =>
    (state.byView[view]?.[relayId] ?? []).some((entry) => entry[idKey] === entityId)
  );
}

export function pinEntityForRelays<IdKey extends string>(
  state: PinnedEntityState<IdKey>,
  view: string,
  relayIds: string[],
  entityId: string,
  idKey: IdKey
): PinnedEntityState<IdKey> {
  let next = state;
  const now = new Date().toISOString();
  for (const relayId of relayIds) {
    const entries = next.byView[view]?.[relayId] ?? [];
    if (entries.some((entry) => entry[idKey] === entityId)) continue;
    const maxOrder = entries.length > 0 ? Math.max(...entries.map((entry) => entry.order)) : -1;
    const newEntry = { [idKey]: entityId, pinnedAt: now, order: maxOrder + 1 } as ViewPinnedEntityEntry<IdKey>;
    next = {
      ...next,
      updatedAt: now,
      byView: {
        ...next.byView,
        [view]: { ...next.byView[view], [relayId]: [...entries, newEntry] },
      },
    };
  }
  return next;
}

export function unpinEntityFromRelays<IdKey extends string>(
  state: PinnedEntityState<IdKey>,
  view: string,
  relayIds: string[],
  entityId: string,
  idKey: IdKey
): PinnedEntityState<IdKey> {
  let next = state;
  const now = new Date().toISOString();
  for (const relayId of relayIds) {
    const entries = next.byView[view]?.[relayId] ?? [];
    if (!entries.some((entry) => entry[idKey] === entityId)) continue;
    next = {
      ...next,
      updatedAt: now,
      byView: {
        ...next.byView,
        [view]: {
          ...next.byView[view],
          [relayId]: entries.filter((entry) => entry[idKey] !== entityId),
        },
      },
    };
  }
  return next;
}
