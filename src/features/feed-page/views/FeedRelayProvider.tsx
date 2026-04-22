import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { NDKRelayStatus, NDKContextValue } from "@/infrastructure/nostr/ndk-context";
import { useNDK } from "@/infrastructure/nostr/ndk-context";
import { getRelayIdFromUrl, getRelayNameFromUrl } from "@/infrastructure/nostr/relay-identity";
import { deriveSelectedRelayUrls } from "@/features/feed-page/controllers/use-index-relay-shell";
import { useRelaySelectionController } from "@/features/feed-page/controllers/use-relay-selection-controller";
import { useRelayAutoReconnect } from "@/features/feed-page/controllers/use-relay-auto-reconnect";
import { isDemoFeedEnabled, DEMO_RELAY_ID } from "@/lib/demo-feed-config";
import { initializeDemoFeedData } from "@/data/demo-feed";
import { mockRelays as demoRelays } from "@/data/mockData";
import type { Relay, Task } from "@/types";

const DEMO_FEED_ENABLED = isDemoFeedEnabled(import.meta.env.VITE_ENABLE_DEMO_FEED);

export interface FeedRelayState {
  relays: Relay[];
  ndkRelays: NDKRelayStatus[];
  demoFeedActive: boolean;
  demoTasks: Task[];
  setDemoTasks: Dispatch<SetStateAction<Task[]>>;
  isConnected: boolean;
  subscribe: NDKContextValue["subscribe"];
  activeRelayIds: Set<string>;
  setActiveRelayIds: Dispatch<SetStateAction<Set<string>>>;
  effectiveActiveRelayIds: Set<string>;
  selectedRelayUrls: string[];
  nostrRelayIdSet: Set<string>;
  allRelayIds: string[];
  handleRelayToggle: (relayId: string) => void;
  handleRelayExclusive: (relayId: string) => void;
  handleRelaySelectIntent: (relayId: string, mode: "toggle" | "exclusive") => string | null;
  handleToggleAllRelays: () => void;
  reconnectRelay: (url: string, options?: { forceNewSocket?: boolean }) => void;
  reorderRelays: (orderedUrls: string[]) => void;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
}

const FeedRelayContext = createContext<FeedRelayState | null>(null);

export function useFeedRelayState(): FeedRelayState {
  const ctx = useContext(FeedRelayContext);
  if (!ctx) throw new Error("useFeedRelayState must be used within FeedRelayProvider");
  return ctx;
}

export function FeedRelayProvider({ children }: PropsWithChildren) {
  const {
    relays: ndkRelays,
    isConnected,
    addRelay,
    reorderRelays,
    removeRelay,
    reconnectRelay,
    subscribe,
  } = useNDK();

  const [demoTasks, setDemoTasks] = useState<Task[]>(() => (
    DEMO_FEED_ENABLED ? initializeDemoFeedData() : []
  ));
  const demoFeedActive = demoTasks.some((task) => task.relays.includes(DEMO_RELAY_ID));

  const relays: Relay[] = useMemo(() => {
    const nostrRelayItems: Relay[] = ndkRelays.map((r): Relay => ({
      id: getRelayIdFromUrl(r.url),
      name: getRelayNameFromUrl(r.url),
      isActive: r.status === "connected" || r.status === "read-only",
      connectionStatus: r.status,
      url: r.url,
    }));
    if (!demoFeedActive) return nostrRelayItems;
    return [...demoRelays, ...nostrRelayItems];
  }, [demoFeedActive, ndkRelays]);

  const {
    activeRelayIds,
    setActiveRelayIds,
    effectiveActiveRelayIds,
    handleRelayToggle,
    handleRelayExclusive,
    handleRelaySelectIntent,
    handleToggleAllRelays,
  } = useRelaySelectionController({ relays });

  useRelayAutoReconnect({ relays, activeRelayIds, reconnectRelay });

  const nostrRelayIds = useMemo(
    () => relays.map((relay) => relay.id).filter((id) => id !== DEMO_RELAY_ID),
    [relays]
  );
  const nostrRelayIdSet = useMemo(() => new Set(nostrRelayIds), [nostrRelayIds]);
  const allRelayIds = useMemo(() => relays.map((relay) => relay.id), [relays]);
  const selectedRelayUrls = useMemo(
    () => deriveSelectedRelayUrls(relays, effectiveActiveRelayIds),
    [effectiveActiveRelayIds, relays]
  );

  const value = useMemo<FeedRelayState>(
    () => ({
      relays,
      ndkRelays,
      demoFeedActive,
      demoTasks,
      setDemoTasks,
      isConnected,
      subscribe,
      activeRelayIds,
      setActiveRelayIds,
      effectiveActiveRelayIds,
      selectedRelayUrls,
      nostrRelayIdSet,
      allRelayIds,
      handleRelayToggle,
      handleRelayExclusive,
      handleRelaySelectIntent,
      handleToggleAllRelays,
      reconnectRelay,
      reorderRelays,
      addRelay,
      removeRelay,
    }),
    [
      relays, ndkRelays, demoFeedActive, demoTasks,
      isConnected, subscribe,
      activeRelayIds, effectiveActiveRelayIds,
      selectedRelayUrls, nostrRelayIdSet, allRelayIds,
      handleRelayToggle, handleRelayExclusive, handleRelaySelectIntent, handleToggleAllRelays,
      reconnectRelay, reorderRelays, addRelay, removeRelay,
    ]
  );

  return (
    <FeedRelayContext.Provider value={value}>
      {children}
    </FeedRelayContext.Provider>
  );
}
