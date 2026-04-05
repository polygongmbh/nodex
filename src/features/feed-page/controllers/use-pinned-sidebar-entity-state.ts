import { useState, useEffect, useMemo, useCallback } from "react";

export interface UsePinnedSidebarEntityStateOptions<S> {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  entityRelayIds: Map<string, Set<string>>;
  loadState: (pubkey?: string) => S;
  saveState: (state: S, pubkey?: string) => void;
  getPinnedIds: (state: S, relayIds: string[]) => string[];
  pinForRelays: (state: S, relayIds: string[], id: string) => S;
  unpinFromRelays: (state: S, relayIds: string[], id: string) => S;
  /** Applied only for relay-map lookups; the stored id is always the original. */
  normalizeEntityId?: (id: string) => string;
}

export interface UsePinnedSidebarEntityStateResult<S> {
  state: S;
  setState: React.Dispatch<React.SetStateAction<S>>;
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
 * loadState/saveState/getPinnedIds/pinForRelays/unpinFromRelays must be
 * stable module-level function references to avoid unnecessary effect runs.
 */
export function usePinnedSidebarEntityState<S>({
  userPubkey,
  effectiveActiveRelayIds,
  entityRelayIds,
  loadState,
  saveState,
  getPinnedIds,
  pinForRelays,
  unpinFromRelays,
  normalizeEntityId,
}: UsePinnedSidebarEntityStateOptions<S>): UsePinnedSidebarEntityStateResult<S> {
  const [state, setState] = useState<S>(() => loadState(userPubkey));

  // Reload when the authenticated user changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setState(loadState(userPubkey)); }, [userPubkey]);

  // Persist whenever state or user changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { saveState(state, userPubkey); }, [state, userPubkey]);

  const activeRelayIdList = useMemo(
    () => Array.from(effectiveActiveRelayIds),
    [effectiveActiveRelayIds]
  );

  const pinnedIds = useMemo(
    () => getPinnedIds(state, activeRelayIdList),
    [getPinnedIds, state, activeRelayIdList]
  );

  const pinAcrossRelays = useCallback(
    (id: string) => {
      const lookupId = normalizeEntityId ? normalizeEntityId(id) : id;
      const relaysWithEntity = entityRelayIds.get(lookupId);
      const targetRelayIds = relaysWithEntity
        ? activeRelayIdList.filter((r) => relaysWithEntity.has(r))
        : activeRelayIdList;
      const relayIds = targetRelayIds.length > 0 ? targetRelayIds : activeRelayIdList;
      setState((prev) => pinForRelays(prev, relayIds, id));
    },
    [activeRelayIdList, entityRelayIds, normalizeEntityId, pinForRelays]
  );

  const unpinAcrossRelays = useCallback(
    (id: string) => {
      setState((prev) => unpinFromRelays(prev, activeRelayIdList, id));
    },
    [activeRelayIdList, unpinFromRelays]
  );

  return { state, setState, activeRelayIdList, pinnedIds, pinAcrossRelays, unpinAcrossRelays };
}
