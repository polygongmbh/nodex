import { useState, useEffect, useMemo, useCallback } from "react";
import {
  createEmptyPinnedEntityState,
  getPinnedEntityIdsForRelays,
  pinEntityForRelays,
  unpinEntityFromRelays,
  type PinnedEntityState,
} from "@/domain/preferences/pinned-entity-state";
import {
  loadPinnedEntityState,
  savePinnedEntityState,
} from "@/infrastructure/preferences/pinned-entity-storage";

export interface UsePinnedSidebarEntityStateOptions<IdKey extends string> {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  entityRelayIds: Map<string, Set<string>>;
  namespace: string;
  idKey: IdKey;
  /** Applied only for relay-map lookups; the stored id is always the original. */
  normalizeEntityId?: (id: string) => string;
}

export interface UsePinnedSidebarEntityStateResult<IdKey extends string> {
  state: PinnedEntityState<IdKey>;
  setState: React.Dispatch<React.SetStateAction<PinnedEntityState<IdKey>>>;
  activeRelayIdList: string[];
  pinnedIds: string[];
  pinAcrossRelays: (id: string) => void;
  unpinAcrossRelays: (id: string) => void;
}

/**
 * Shared controller scaffold for pinned sidebar entities.
 *
 * Owns: state load/reload/persist, activeRelayIdList, pinnedIds,
 * and the relay-scoped pin/unpin callbacks.
 *
 * Does NOT know about Task, Channel, Person, tag parsing, or stub shapes.
 */
export function usePinnedSidebarEntityState<IdKey extends string>({
  userPubkey,
  effectiveActiveRelayIds,
  entityRelayIds,
  namespace,
  idKey,
  normalizeEntityId,
}: UsePinnedSidebarEntityStateOptions<IdKey>): UsePinnedSidebarEntityStateResult<IdKey> {
  const [state, setState] = useState<PinnedEntityState<IdKey>>(
    () => loadPinnedEntityState({ namespace, idKey, pubkey: userPubkey, createEmptyState: createEmptyPinnedEntityState })
  );

  // Reload when the authenticated user changes.
  useEffect(() => {
    setState(loadPinnedEntityState({ namespace, idKey, pubkey: userPubkey, createEmptyState: createEmptyPinnedEntityState }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPubkey]);

  // Persist whenever state or user changes.
  useEffect(() => {
    savePinnedEntityState({ namespace, state, pubkey: userPubkey });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, userPubkey]);

  const activeRelayIdList = useMemo(
    () => Array.from(effectiveActiveRelayIds),
    [effectiveActiveRelayIds]
  );

  const pinnedIds = useMemo(
    () => getPinnedEntityIdsForRelays(state, activeRelayIdList, idKey),
    // idKey and namespace are constants at the call site; no need to react to them
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, activeRelayIdList]
  );

  const pinAcrossRelays = useCallback(
    (id: string) => {
      const lookupId = normalizeEntityId ? normalizeEntityId(id) : id;
      const relaysWithEntity = entityRelayIds.get(lookupId);
      const targetRelayIds = relaysWithEntity
        ? activeRelayIdList.filter((r) => relaysWithEntity.has(r))
        : activeRelayIdList;
      const relayIds = targetRelayIds.length > 0 ? targetRelayIds : activeRelayIdList;
      setState((prev) => pinEntityForRelays(prev, relayIds, id, idKey));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRelayIdList, entityRelayIds, normalizeEntityId]
  );

  const unpinAcrossRelays = useCallback(
    (id: string) => {
      setState((prev) => unpinEntityFromRelays(prev, activeRelayIdList, id, idKey));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRelayIdList]
  );

  return { state, setState, activeRelayIdList, pinnedIds, pinAcrossRelays, unpinAcrossRelays };
}
