import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NostrRelayPool, resetRelayPool } from "./relay-pool";
import { NostrEvent, NostrEventKind, NostrFilter } from "./types";

// Mock WebSocket implementation for tests
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event("open"));
    }
  }

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data: JSON.stringify(data) }));
    }
  }

  simulateClose(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close", { code, reason }));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent("close", { code: 1000 }));
    }
  }

  static reset() {
    MockWebSocket.instances = [];
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

// Replace global WebSocket
const originalWebSocket = globalThis.WebSocket;

describe("NostrRelayPool", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    resetRelayPool();
    (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket =
      MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    resetRelayPool();
    (globalThis as typeof globalThis & { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  });

  describe("connection management", () => {
    it("should connect to a relay", async () => {
      const onConnect = vi.fn();
      const pool = new NostrRelayPool({}, { onConnect });

      pool.connect("wss://relay.example.com");

      const ws = MockWebSocket.getLatest();
      expect(ws).toBeDefined();
      expect(ws?.url).toBe("wss://relay.example.com");

      ws?.simulateOpen();

      expect(onConnect).toHaveBeenCalledWith("wss://relay.example.com");
    });

    it("should handle disconnect", async () => {
      const onDisconnect = vi.fn();
      const pool = new NostrRelayPool({}, { onDisconnect });

      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();
      ws?.simulateClose();

      expect(onDisconnect).toHaveBeenCalledWith("wss://relay.example.com");
    });

    it("should track relay status", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay1.example.com");
      pool.connect("wss://relay2.example.com");

      MockWebSocket.instances[0]?.simulateOpen();

      const statuses = pool.getRelayStatus();
      expect(statuses).toHaveLength(2);
      expect(statuses.find((s) => s.url === "wss://relay1.example.com")?.status).toBe("connected");
      expect(statuses.find((s) => s.url === "wss://relay2.example.com")?.status).toBe("connecting");
    });

    it("should report isConnected correctly", () => {
      const pool = new NostrRelayPool();
      expect(pool.isConnected()).toBe(false);

      pool.connect("wss://relay.example.com");
      expect(pool.isConnected()).toBe(false);

      MockWebSocket.getLatest()?.simulateOpen();
      expect(pool.isConnected()).toBe(true);
    });

    it("should disconnect from a relay", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      MockWebSocket.getLatest()?.simulateOpen();

      pool.disconnect("wss://relay.example.com");

      expect(pool.getRelayStatus()).toHaveLength(0);
    });

    it("should disconnect from all relays", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay1.example.com");
      pool.connect("wss://relay2.example.com");
      MockWebSocket.instances.forEach((ws) => ws.simulateOpen());

      pool.disconnectAll();

      expect(pool.getRelayStatus()).toHaveLength(0);
    });

    it("should reconnect forever with fibonacci backoff intervals", () => {
      vi.useFakeTimers();
      try {
        const pool = new NostrRelayPool({ reconnectInterval: 100, maxReconnectAttempts: 1 });
        pool.connect("wss://relay.example.com");

        const ws1 = MockWebSocket.getLatest();
        expect(MockWebSocket.instances).toHaveLength(1);
        ws1?.simulateError();

        vi.advanceTimersByTime(100);
        expect(MockWebSocket.instances).toHaveLength(2);

        const ws2 = MockWebSocket.getLatest();
        ws2?.simulateError();
        vi.advanceTimersByTime(100);
        expect(MockWebSocket.instances).toHaveLength(3);

        const ws3 = MockWebSocket.getLatest();
        ws3?.simulateError();
        vi.advanceTimersByTime(199);
        expect(MockWebSocket.instances).toHaveLength(3);
        vi.advanceTimersByTime(1);
        expect(MockWebSocket.instances).toHaveLength(4);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("subscriptions", () => {
    it("should subscribe to events", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      MockWebSocket.getLatest()?.simulateOpen();

      const onEvent = vi.fn();
      const filters: NostrFilter[] = [{ kinds: [NostrEventKind.TextNote], limit: 10 }];

      pool.subscribe({ id: "test-sub", filters, onEvent });

      const ws = MockWebSocket.getLatest();
      expect(ws?.sentMessages).toHaveLength(1);
      
      const message = JSON.parse(ws!.sentMessages[0]);
      expect(message[0]).toBe("REQ");
      expect(message[1]).toBe("test-sub");
      expect(message[2]).toEqual(filters[0]);
    });

    it("should receive events from subscription", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();

      const onEvent = vi.fn();
      pool.subscribe({
        id: "test-sub",
        filters: [{ kinds: [NostrEventKind.TextNote] }],
        onEvent,
      });

      const mockEvent: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: NostrEventKind.TextNote,
        tags: [],
        content: "Hello, Nostr!",
        sig: "c".repeat(128),
      };

      ws?.simulateMessage(["EVENT", "test-sub", mockEvent]);

      expect(onEvent).toHaveBeenCalledWith({ ...mockEvent, relayUrl: "wss://relay.example.com" });
    });

    it("should deduplicate events", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();

      const onEvent = vi.fn();
      pool.subscribe({
        id: "test-sub",
        filters: [{ kinds: [NostrEventKind.TextNote] }],
        onEvent,
      });

      const mockEvent: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: NostrEventKind.TextNote,
        tags: [],
        content: "Hello!",
        sig: "c".repeat(128),
      };

      // Send same event twice
      ws?.simulateMessage(["EVENT", "test-sub", mockEvent]);
      ws?.simulateMessage(["EVENT", "test-sub", mockEvent]);

      expect(onEvent).toHaveBeenCalledTimes(1);
    });

    it("should call onEose when EOSE received", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();

      const onEose = vi.fn();
      pool.subscribe({
        id: "test-sub",
        filters: [{ kinds: [NostrEventKind.TextNote] }],
        onEvent: vi.fn(),
        onEose,
      });

      ws?.simulateMessage(["EOSE", "test-sub"]);

      expect(onEose).toHaveBeenCalled();
    });

    it("should unsubscribe and send CLOSE", () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();

      const unsubscribe = pool.subscribe({
        id: "test-sub",
        filters: [{ kinds: [NostrEventKind.TextNote] }],
        onEvent: vi.fn(),
      });

      // Clear sent messages from REQ
      ws!.sentMessages = [];

      unsubscribe();

      expect(ws?.sentMessages).toHaveLength(1);
      const message = JSON.parse(ws!.sentMessages[0]);
      expect(message).toEqual(["CLOSE", "test-sub"]);
    });
  });

  describe("publishing", () => {
    it("should publish event to connected relays", async () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();

      const mockEvent: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: NostrEventKind.TextNote,
        tags: [],
        content: "Test post",
        sig: "c".repeat(128),
      };

      const publishPromise = pool.publish(mockEvent);

      // Simulate OK response
      setTimeout(() => {
        ws?.simulateMessage(["OK", mockEvent.id, true, ""]);
      }, 10);

      const results = await publishPromise;

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].relay).toBe("wss://relay.example.com");
    });

    it("should handle publish failure", async () => {
      const pool = new NostrRelayPool();
      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();

      const mockEvent: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: NostrEventKind.TextNote,
        tags: [],
        content: "Test",
        sig: "c".repeat(128),
      };

      const publishPromise = pool.publish(mockEvent);

      setTimeout(() => {
        ws?.simulateMessage(["OK", mockEvent.id, false, "blocked: spam filter"]);
      }, 10);

      const results = await publishPromise;

      expect(results[0].success).toBe(false);
      expect(results[0].message).toBe("blocked: spam filter");
    });

    it("should fail publish to disconnected relay", async () => {
      const pool = new NostrRelayPool();
      // Don't connect

      const mockEvent: NostrEvent = {
        id: "a".repeat(64),
        pubkey: "b".repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: NostrEventKind.TextNote,
        tags: [],
        content: "Test",
        sig: "c".repeat(128),
      };

      const results = await pool.publish(mockEvent, ["wss://relay.example.com"]);

      expect(results[0].success).toBe(false);
      expect(results[0].message).toBe("Relay not connected");
    });
  });

  describe("relay notices", () => {
    it("should handle NOTICE messages", () => {
      const onNotice = vi.fn();
      const pool = new NostrRelayPool({}, { onNotice });
      pool.connect("wss://relay.example.com");
      const ws = MockWebSocket.getLatest();
      ws?.simulateOpen();

      ws?.simulateMessage(["NOTICE", "Rate limited"]);

      expect(onNotice).toHaveBeenCalledWith("wss://relay.example.com", "Rate limited");
    });
  });
});
