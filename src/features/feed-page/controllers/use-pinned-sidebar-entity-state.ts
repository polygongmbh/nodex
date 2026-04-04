import { useCallback, useEffect, useMemo, useState } from "react";

interface UsePinnedSidebarEntityStateOptions<State> {
  userPubkey: string | undefined;
  effectiveActiveRelayIds: Set<string>;
  loadState: (pubkey?: string) => State;
  saveState: (state: State, pubkey?: string) => void;
  getPinnedIdsForRelays: (state: State, relayIds: string[]) => string[];
  pinForRelays: (state: State, relayIds: string[], entityId: string) => State;
  unpinFromRelays: (state: State, relayIds: string[], entityId: string) => State;
}

interface UsePinnedSidebarEntityStateResult<State> {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State>>;
  activeRelayIdList: string[];
  pinnedIds: string[];
  pinAcrossRelays: (relayIds: string[], entityId: string) => void;
  unpinAcrossRelays: (entityId: string) => void;
}

export function usePinnedSidebarEntityState<State>({
  userPubkey,
  effectiveActiveRelayIds,
  loadState,
  saveState,
  getPinnedIdsForRelays,
  pinForRelays,
  unpinFromRelays,
}: UsePinnedSidebarEntityStateOptions<State>): UsePinnedSidebarEntityStateResult<State> {
  const [state, setState] = useState<State>(() => loadState(userPubkey));

  useEffect(() => {
    setState(loadState(userPubkey));
  }, [loadState, userPubkey]);

  useEffect(() => {
    saveState(state, userPubkey);
  }, [saveState, state, userPubkey]);

  const activeRelayIdList = useMemo(
    () => Array.from(effectiveActiveRelayIds),
    [effectiveActiveRelayIds]
  );
  const pinnedIds = useMemo(
    () => getPinnedIdsForRelays(state, activeRelayIdList),
    [activeRelayIdList, getPinnedIdsForRelays, state]
  );

  const pinAcrossRelays = useCallback(
    (relayIds: string[], entityId: string) => {
      setState((previous) => pinForRelays(previous, relayIds, entityId));
    },
    [pinForRelays]
  );

  const unpinAcrossRelays = useCallback(
    (entityId: string) => {
      setState((previous) => unpinFromRelays(previous, activeRelayIdList, entityId));
    },
    [activeRelayIdList, unpinFromRelays]
  );

  return {
    state,
    setState,
    activeRelayIdList,
    pinnedIds,
    pinAcrossRelays,
    unpinAcrossRelays,
  };
}
