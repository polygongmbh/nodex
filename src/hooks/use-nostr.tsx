import { useState, useEffect, useCallback, useRef } from "react";
import {
  NostrRelayPool,
  NostrEvent,
  NostrFilter,
  getRelayPool,
  resetRelayPool,
  NostrEventKind,
} from "@/lib/nostr";
import { signEvent, createUnsignedEvent } from "@/lib/nostr/utils";

export interface NostrRelay {
  url: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  latency?: number;
}

// Extended event with relay source
export interface NostrEventWithRelay extends NostrEvent {
  relayUrl?: string;
}

export interface UseNostrOptions {
  defaultRelays?: string[];
  autoConnect?: boolean;
}

export interface UseNostrReturn {
  relays: NostrRelay[];
  events: NostrEventWithRelay[];
  isConnected: boolean;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  subscribe: (filters: NostrFilter[], onEvent?: (event: NostrEventWithRelay) => void) => () => void;
  publish: (content: string, kind: NostrEventKind, tags?: string[][], parentId?: string) => Promise<boolean>;
  clearEvents: () => void;
}

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
];

// Mock pubkey for local development (in production, use NIP-07 extension)
const MOCK_PUBKEY = "0".repeat(64);

export function useNostr(options: UseNostrOptions = {}): UseNostrReturn {
  const { defaultRelays = DEFAULT_RELAYS, autoConnect = true } = options;
  
  const [relays, setRelays] = useState<NostrRelay[]>([]);
  const [events, setEvents] = useState<NostrEventWithRelay[]>([]);
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
    (filters: NostrFilter[], onEvent?: (event: NostrEventWithRelay) => void) => {
      if (!poolRef.current) {
        return () => {};
      }

      const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const unsubscribe = poolRef.current.subscribe({
        id: subscriptionId,
        filters,
        onEvent: (event) => {
          // Add relay URL to event (note: relay pool doesn't provide this yet, but we prepare the type)
          const eventWithRelay: NostrEventWithRelay = event;
          setEvents((prev) => {
            // Check for duplicates
            if (prev.some((e) => e.id === event.id)) {
              return prev;
            }
            // Add event and sort by created_at descending
            const newEvents = [eventWithRelay, ...prev].sort(
              (a, b) => b.created_at - a.created_at
            );
            // Limit to 500 events
            return newEvents.slice(0, 500);
          });
          onEvent?.(eventWithRelay);
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

  // Publish an event to connected relays
  const publish = useCallback(
    async (content: string, kind: NostrEventKind, tags: string[][] = [], parentId?: string): Promise<boolean> => {
      if (!poolRef.current) {
        console.error("No relay pool available");
        return false;
      }

      // Build tags
      const eventTags: string[][] = [...tags];
      
      // Add reply tag if this is a reply
      if (parentId) {
        eventTags.push(["e", parentId, "", "reply"]);
      }

      // Extract hashtags from content and add as t tags
      const hashtagRegex = /#(\w+)/g;
      let match;
      while ((match = hashtagRegex.exec(content)) !== null) {
        eventTags.push(["t", match[1].toLowerCase()]);
      }

      // Create and sign the event
      const unsignedEvent = createUnsignedEvent(MOCK_PUBKEY, kind, content, eventTags);
      const signedEvent = signEvent(unsignedEvent);

      try {
        const results = await poolRef.current.publish(signedEvent);
        const anySuccess = results.some((r) => r.success);
        
        if (anySuccess) {
          // Add our own event to the list
          setEvents((prev) => [signedEvent, ...prev].slice(0, 500));
        }

        return anySuccess;
      } catch (error) {
        console.error("Failed to publish event:", error);
        return false;
      }
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
    publish,
    clearEvents,
  };
}
