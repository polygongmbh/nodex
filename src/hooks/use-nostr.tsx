import { useState, useEffect, useCallback, useRef } from "react";
import {
  NostrRelayPool,
  NostrEvent,
  NostrFilter,
  RelayConnection,
  getRelayPool,
  resetRelayPool,
} from "@/lib/nostr";

export interface NostrRelay {
  url: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  latency?: number;
}

export interface UseNostrOptions {
  defaultRelays?: string[];
  autoConnect?: boolean;
}

export interface UseNostrReturn {
  relays: NostrRelay[];
  events: NostrEvent[];
  isConnected: boolean;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  subscribe: (filters: NostrFilter[], onEvent?: (event: NostrEvent) => void) => () => void;
  clearEvents: () => void;
}

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
];

export function useNostr(options: UseNostrOptions = {}): UseNostrReturn {
  const { defaultRelays = DEFAULT_RELAYS, autoConnect = true } = options;
  
  const [relays, setRelays] = useState<NostrRelay[]>([]);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const poolRef = useRef<NostrRelayPool | null>(null);
  const latencyMap = useRef<Map<string, number>>(new Map());
  const connectionStartTimes = useRef<Map<string, number>>(new Map());

  // Initialize relay pool
  useEffect(() => {
    if (!autoConnect) return;

    // Reset any existing pool
    resetRelayPool();

    // Initialize relays state
    const initialRelays = defaultRelays.map((url) => ({
      url,
      status: "connecting" as const,
    }));
    setRelays(initialRelays);

    // Track connection start times
    defaultRelays.forEach((url) => {
      connectionStartTimes.current.set(url, Date.now());
    });

    // Create pool with event handlers
    const pool = getRelayPool(
      {
        defaultRelays,
        connectionTimeout: 10000,
        reconnectInterval: 5000,
        maxReconnectAttempts: 3,
      },
      {
        onConnect: (relay) => {
          const startTime = connectionStartTimes.current.get(relay);
          const latency = startTime ? Date.now() - startTime : undefined;
          if (latency) {
            latencyMap.current.set(relay, latency);
          }
          setRelays((prev) =>
            prev.map((r) =>
              r.url === relay
                ? { ...r, status: "connected", latency }
                : r
            )
          );
        },
        onDisconnect: (relay) => {
          setRelays((prev) =>
            prev.map((r) =>
              r.url === relay ? { ...r, status: "disconnected" } : r
            )
          );
        },
        onError: (relay, error) => {
          console.error(`Relay ${relay} error:`, error);
          setRelays((prev) =>
            prev.map((r) =>
              r.url === relay ? { ...r, status: "error" } : r
            )
          );
        },
        onNotice: (relay, message) => {
          console.log(`Relay ${relay} notice:`, message);
        },
      }
    );

    poolRef.current = pool;

    return () => {
      resetRelayPool();
      poolRef.current = null;
    };
  }, [autoConnect, defaultRelays.join(",")]);

  // Add a new relay
  const addRelay = useCallback((url: string) => {
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      console.error("Invalid relay URL");
      return;
    }

    // Check if already exists
    if (relays.some((r) => r.url === url)) {
      return;
    }

    // Add to state
    setRelays((prev) => [...prev, { url, status: "connecting" }]);

    // Track connection start time
    connectionStartTimes.current.set(url, Date.now());

    // Connect
    poolRef.current?.connect(url);
  }, [relays]);

  // Remove a relay
  const removeRelay = useCallback((url: string) => {
    poolRef.current?.disconnect(url);
    setRelays((prev) => prev.filter((r) => r.url !== url));
    latencyMap.current.delete(url);
    connectionStartTimes.current.delete(url);
  }, []);

  // Subscribe to events
  const subscribe = useCallback(
    (filters: NostrFilter[], onEvent?: (event: NostrEvent) => void) => {
      if (!poolRef.current) {
        return () => {};
      }

      const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const unsubscribe = poolRef.current.subscribe({
        id: subscriptionId,
        filters,
        onEvent: (event) => {
          setEvents((prev) => {
            // Check for duplicates
            if (prev.some((e) => e.id === event.id)) {
              return prev;
            }
            // Add event and sort by created_at descending
            const newEvents = [event, ...prev].sort(
              (a, b) => b.created_at - a.created_at
            );
            // Limit to 500 events
            return newEvents.slice(0, 500);
          });
          onEvent?.(event);
        },
        onEose: () => {
          console.log(`End of stored events for ${subscriptionId}`);
        },
        onError: (error) => {
          console.error(`Subscription ${subscriptionId} error:`, error);
        },
      });

      return unsubscribe;
    },
    []
  );

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Check if any relay is connected
  const isConnected = relays.some((r) => r.status === "connected");

  return {
    relays,
    events,
    isConnected,
    addRelay,
    removeRelay,
    subscribe,
    clearEvents,
  };
}
