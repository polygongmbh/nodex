import {
  NostrEvent,
  NostrFilter,
  NostrClientMessage,
  NostrRelayMessage,
  RelayConnection,
  RelayStatus,
  SubscriptionOptions,
  PublishResult,
} from "./types";

export interface RelayPoolConfig {
  defaultRelays?: string[];
  connectionTimeout?: number;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface RelayPoolEvents {
  onConnect?: (relay: string) => void;
  onDisconnect?: (relay: string) => void;
  onError?: (relay: string, error: string) => void;
  onNotice?: (relay: string, message: string) => void;
}

// Extended event with relay source
export interface NostrEventWithRelay extends NostrEvent {
  relayUrl?: string;
}

interface ActiveSubscription {
  id: string;
  filters: NostrFilter[];
  onEvent: (event: NostrEventWithRelay) => void;
  onEose?: () => void;
  onError?: (error: string) => void;
  relays: Set<string>;
  eoseReceived: Set<string>;
}

interface RelaySocket {
  ws: WebSocket | null;
  status: RelayStatus;
  reconnectAttempts: number;
  reconnectTimeout?: ReturnType<typeof setTimeout>;
}

export class NostrRelayPool {
  private relays: Map<string, RelaySocket> = new Map();
  private subscriptions: Map<string, ActiveSubscription> = new Map();
  private config: Required<RelayPoolConfig>;
  private events: RelayPoolEvents;
  private seenEvents: Set<string> = new Set();

  constructor(config: RelayPoolConfig = {}, events: RelayPoolEvents = {}) {
    this.config = {
      defaultRelays: config.defaultRelays || [],
      connectionTimeout: config.connectionTimeout || 5000,
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 5,
    };
    this.events = events;

    // Connect to default relays
    this.config.defaultRelays.forEach((url) => this.connect(url));
  }

  /**
   * Connect to a relay
   */
  connect(url: string): void {
    const existingRelay = this.relays.get(url);
    if (existingRelay) {
      const relay = existingRelay;
      if (relay.status === "connected" || relay.status === "connecting") {
        return;
      }
    }

    const relaySocket: RelaySocket = existingRelay || {
      ws: null,
      status: "connecting",
      reconnectAttempts: 0,
    };
    relaySocket.status = "connecting";
    relaySocket.ws = null;

    if (relaySocket.reconnectTimeout) {
      clearTimeout(relaySocket.reconnectTimeout);
      relaySocket.reconnectTimeout = undefined;
    }

    this.relays.set(url, relaySocket);

    try {
      const ws = new WebSocket(url);
      relaySocket.ws = ws;

      const connectionTimeout = setTimeout(() => {
        if (relaySocket.status === "connecting") {
          ws.close();
          this.handleError(url, "Connection timeout");
        }
      }, this.config.connectionTimeout);

      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        relaySocket.status = "connected";
        relaySocket.reconnectAttempts = 0;
        relaySocket.reconnectTimeout = undefined;
        this.events.onConnect?.(url);

        // Resubscribe to active subscriptions
        this.subscriptions.forEach((sub) => {
          if (sub.relays.has(url) || sub.relays.size === 0) {
            this.sendSubscription(url, sub.id, sub.filters);
          }
        });
      };

      ws.onclose = () => {
        clearTimeout(connectionTimeout);
        relaySocket.status = "disconnected";
        this.events.onDisconnect?.(url);
        this.scheduleReconnect(url);
      };

      ws.onerror = () => {
        clearTimeout(connectionTimeout);
        this.handleError(url, "WebSocket error");
      };

      ws.onmessage = (event) => {
        this.handleMessage(url, event.data);
      };
    } catch (error) {
      this.handleError(url, String(error));
    }
  }

  /**
   * Disconnect from a relay
   */
  disconnect(url: string): void {
    const relay = this.relays.get(url);
    if (!relay) return;

    if (relay.reconnectTimeout) {
      clearTimeout(relay.reconnectTimeout);
    }

    if (relay.ws) {
      relay.ws.close();
    }

    this.relays.delete(url);
  }

  /**
   * Disconnect from all relays
   */
  disconnectAll(): void {
    this.relays.forEach((_, url) => this.disconnect(url));
  }

  /**
   * Subscribe to events matching filters
   */
  subscribe(options: Omit<SubscriptionOptions, 'onEvent'> & { onEvent: (event: NostrEventWithRelay) => void }, relayUrls?: string[]): () => void {
    const { id, filters, onEvent, onEose, onError } = options;

    const subscription: ActiveSubscription = {
      id,
      filters,
      onEvent,
      onEose,
      onError,
      relays: new Set(relayUrls || []),
      eoseReceived: new Set(),
    };

    this.subscriptions.set(id, subscription);

    // Send subscription to connected relays
    this.relays.forEach((relay, url) => {
      if (relay.status === "connected") {
        if (subscription.relays.size === 0 || subscription.relays.has(url)) {
          this.sendSubscription(url, id, filters);
        }
      }
    });

    // Return unsubscribe function
    return () => this.unsubscribe(id);
  }

  /**
   * Unsubscribe from a subscription
   */
  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Send CLOSE to all connected relays
    this.relays.forEach((relay, url) => {
      if (relay.status === "connected" && relay.ws) {
        const message: NostrClientMessage = ["CLOSE", subscriptionId];
        relay.ws.send(JSON.stringify(message));
      }
    });

    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Publish an event to relays
   */
  async publish(event: NostrEvent, relayUrls?: string[]): Promise<PublishResult[]> {
    const results: PublishResult[] = [];
    const targetRelays = relayUrls || Array.from(this.relays.keys());

    const publishPromises = targetRelays.map((url) => {
      return new Promise<PublishResult>((resolve) => {
        const relay = this.relays.get(url);

        if (!relay || relay.status !== "connected" || !relay.ws) {
          resolve({
            success: false,
            eventId: event.id,
            relay: url,
            message: "Relay not connected",
          });
          return;
        }

        // Set up timeout for OK response
        const timeout = setTimeout(() => {
          resolve({
            success: false,
            eventId: event.id,
            relay: url,
            message: "Publish timeout",
          });
        }, 5000);

        // Listen for OK response
        const originalOnMessage = relay.ws.onmessage;
        relay.ws.onmessage = (msgEvent) => {
          originalOnMessage?.call(relay.ws, msgEvent);
          
          try {
            const message: NostrRelayMessage = JSON.parse(msgEvent.data);
            if (message[0] === "OK" && message[1] === event.id) {
              clearTimeout(timeout);
              relay.ws!.onmessage = originalOnMessage;
              resolve({
                success: message[2],
                eventId: event.id,
                relay: url,
                message: message[3] || undefined,
              });
            }
          } catch {
            // Ignore parse errors
          }
        };

        // Send event
        const message: NostrClientMessage = ["EVENT", event];
        relay.ws.send(JSON.stringify(message));
      });
    });

    const settled = await Promise.all(publishPromises);
    return settled;
  }

  /**
   * Get connection status for all relays
   */
  getRelayStatus(): RelayConnection[] {
    return Array.from(this.relays.entries()).map(([url, relay]) => ({
      url,
      status: relay.status,
    }));
  }

  /**
   * Check if any relay is connected
   */
  isConnected(): boolean {
    return Array.from(this.relays.values()).some((r) => r.status === "connected");
  }

  private sendSubscription(url: string, id: string, filters: NostrFilter[]): void {
    const relay = this.relays.get(url);
    if (!relay?.ws || relay.status !== "connected") return;

    const message: NostrClientMessage = ["REQ", id, ...filters];
    relay.ws.send(JSON.stringify(message));
  }

  private handleMessage(url: string, data: string): void {
    try {
      const message: NostrRelayMessage = JSON.parse(data);

      switch (message[0]) {
        case "EVENT": {
          const [, subscriptionId, event] = message;
          this.handleEvent(subscriptionId, event, url);
          break;
        }
        case "EOSE": {
          const [, subscriptionId] = message;
          this.handleEose(url, subscriptionId);
          break;
        }
        case "NOTICE": {
          const [, notice] = message;
          this.events.onNotice?.(url, notice);
          break;
        }
        case "OK": {
          // Handled in publish method
          break;
        }
        case "CLOSED": {
          const [, subscriptionId, reason] = message;
          const subscription = this.subscriptions.get(subscriptionId);
          subscription?.onError?.(reason);
          break;
        }
      }
    } catch (error) {
      console.error("Failed to parse relay message:", error);
    }
  }

  private handleEvent(subscriptionId: string, event: NostrEvent, relayUrl: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    // Deduplicate events
    if (this.seenEvents.has(event.id)) return;
    this.seenEvents.add(event.id);

    // Limit seen events cache
    if (this.seenEvents.size > 10000) {
      const iterator = this.seenEvents.values();
      for (let i = 0; i < 1000; i++) {
        this.seenEvents.delete(iterator.next().value);
      }
    }

    // Attach relay URL to event
    const eventWithRelay: NostrEventWithRelay = { ...event, relayUrl };
    subscription.onEvent(eventWithRelay);
  }

  private handleEose(url: string, subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    subscription.eoseReceived.add(url);

    // Check if EOSE received from all subscribed relays
    const targetRelays =
      subscription.relays.size > 0
        ? subscription.relays
        : new Set(this.relays.keys());

    const allEoseReceived = Array.from(targetRelays).every((r) =>
      subscription.eoseReceived.has(r)
    );

    if (allEoseReceived) {
      subscription.onEose?.();
    }
  }

  private handleError(url: string, error: string): void {
    const relay = this.relays.get(url);
    if (relay) {
      relay.status = "error";
    }
    this.events.onError?.(url, error);
    this.scheduleReconnect(url);
  }

  private scheduleReconnect(url: string): void {
    const relay = this.relays.get(url);
    if (!relay) return;

    if (relay.reconnectTimeout) {
      return;
    }
    const fibMultiplier = this.getFibonacci(Math.max(1, relay.reconnectAttempts + 1));
    const reconnectDelay = this.config.reconnectInterval * fibMultiplier;

    relay.reconnectTimeout = setTimeout(() => {
      relay.reconnectTimeout = undefined;
      relay.reconnectAttempts++;
      this.connect(url);
    }, reconnectDelay);
  }

  private getFibonacci(index: number): number {
    if (index <= 2) return 1;
    let prev = 1;
    let curr = 1;
    for (let i = 3; i <= index; i++) {
      const next = prev + curr;
      prev = curr;
      curr = next;
    }
    return curr;
  }
}

// Singleton instance for app-wide use
let defaultPool: NostrRelayPool | null = null;

export function getRelayPool(
  config?: RelayPoolConfig,
  events?: RelayPoolEvents
): NostrRelayPool {
  if (!defaultPool) {
    defaultPool = new NostrRelayPool(config, events);
  }
  return defaultPool;
}

export function resetRelayPool(): void {
  if (defaultPool) {
    defaultPool.disconnectAll();
    defaultPool = null;
  }
}
