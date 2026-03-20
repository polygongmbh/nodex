import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NDKProvider, useNDK } from "./ndk-provider";

const mockedNdk = vi.hoisted(() => {
  interface NdkLike {
    pool: FakePool;
    signer: unknown;
    relayAuthDefaultPolicy: unknown;
    connect(): Promise<void>;
    subscribe(): { on(): void; stop(): void };
  }

  const ndkInstances: NdkLike[] = [];

  enum MockNDKRelayStatus {
    DISCONNECTING = 0,
    DISCONNECTED = 1,
    RECONNECTING = 2,
    FLAPPING = 3,
    CONNECTING = 4,
    CONNECTED = 5,
    AUTH_REQUESTED = 6,
    AUTHENTICATING = 7,
    AUTHENTICATED = 8,
  }

  class FakeWebSocket {
    readyState = 1;
    private messageListeners = new Set<(event: MessageEvent) => void>();

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (type !== "message" || !listener) return;
      if (typeof listener === "function") {
        this.messageListeners.add(listener as (event: MessageEvent) => void);
        return;
      }
      this.messageListeners.add((event: MessageEvent) => listener.handleEvent(event));
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (type !== "message" || !listener) return;
      if (typeof listener === "function") {
        this.messageListeners.delete(listener as (event: MessageEvent) => void);
      }
    }

    emitMessage(data: string) {
      const messageEvent = { data } as MessageEvent;
      this.messageListeners.forEach((listener) => listener(messageEvent));
    }
  }

  class FakeRelay {
    url: string;
    status = MockNDKRelayStatus.DISCONNECTED;
    connectCalls = 0;
    disconnectCalls = 0;
    socketOpen = false;
    connectivity: { ws?: FakeWebSocket } = {};
    constructor(url: string, private pool: FakePool) {
      this.url = url.replace(/\/+$/, "");
    }

    emitServerMessage(data: string) {
      this.connectivity.ws?.emitMessage(data);
    }

    connect() {
      this.connectCalls += 1;
      this.socketOpen = true;
      this.connectivity.ws = new FakeWebSocket();
      this.connectivity.ws.readyState = 0;
      this.status = MockNDKRelayStatus.CONNECTING;
      this.pool.emit("relay:connecting", this);
      this.connectivity.ws.readyState = 1;
      this.status = MockNDKRelayStatus.CONNECTED;
      this.pool.emit("relay:connect", this);
    }
    disconnect() {
      this.disconnectCalls += 1;
      this.socketOpen = false;
      if (this.connectivity.ws) {
        this.connectivity.ws.readyState = 3;
      }
      this.status = MockNDKRelayStatus.DISCONNECTED;
      this.pool.emit("relay:disconnect", this);
    }
  }

  class FakePool {
    relays = new Map<string, FakeRelay>();
    createdRelays = new Map<string, FakeRelay[]>();
    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

    constructor(explicitRelayUrls: string[]) {
      explicitRelayUrls.forEach((url) => {
        const relay = this.createRelay(url);
        this.relays.set(relay.url, relay);
      });
    }

    private createRelay(url: string) {
      const relay = new FakeRelay(url, this);
      const normalized = relay.url;
      const created = this.createdRelays.get(normalized) ?? [];
      created.push(relay);
      this.createdRelays.set(normalized, created);
      return relay;
    }

    on(event: string, callback: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) ?? new Set();
      listeners.add(callback);
      this.listeners.set(event, listeners);
    }

    emit(event: string, ...args: unknown[]) {
      this.listeners.get(event)?.forEach((listener) => listener(...args));
    }

    removeAllListeners() {
      this.listeners.clear();
    }

    getRelay(url: string, connect = true) {
      const normalized = url.replace(/\/+$/, "");
      let relay = this.relays.get(normalized);
      if (!relay) {
        relay = this.createRelay(normalized);
        this.relays.set(normalized, relay);
      }
      if (connect && relay.status !== MockNDKRelayStatus.CONNECTED && relay.status !== MockNDKRelayStatus.CONNECTING) {
        relay.connect();
      }
      return relay;
    }

    removeRelay(url: string) {
      const normalized = url.replace(/\/+$/, "");
      const relay = this.relays.get(normalized);
      if (!relay) return false;
      this.relays.delete(normalized);
      relay.disconnect();
      return true;
    }

    connectAll() {
      this.relays.forEach((relay) => {
        relay.connect();
      });
    }

    getCreatedRelays(url: string) {
      return this.createdRelays.get(url.replace(/\/+$/, "")) ?? [];
    }

    getOpenSocketCount(url: string) {
      return this.getCreatedRelays(url).filter((relay) => relay.socketOpen).length;
    }
  }

  class FakeNDK {
    pool: FakePool;
    signer: unknown;
    relayAuthDefaultPolicy: unknown;

    constructor(options: { explicitRelayUrls?: string[] }) {
      this.pool = new FakePool(options.explicitRelayUrls ?? []);
      this.signer = undefined;
      this.relayAuthDefaultPolicy = undefined;
      ndkInstances.push(this);
    }

    async connect() {
      this.pool.connectAll();
    }

    subscribe() {
      return {
        on() {},
        stop() {},
      };
    }
  }

  return {
    FakeNDK,
    FakeRelay,
    MockNDKRelayStatus,
    ndkInstances,
  };
});

vi.mock("@nostr-dev-kit/ndk", () => ({
  __esModule: true,
  default: mockedNdk.FakeNDK,
  NDKRelayStatus: mockedNdk.MockNDKRelayStatus,
  NDKEvent: class {},
  NDKNip07Signer: class {},
  NDKNip46Signer: { bunker: () => ({ blockUntilReady: async () => ({ fetchProfile: async () => {}, pubkey: "pub", npub: "npub" }) }) },
  NDKPrivateKeySigner: class {
    async user() {
      return { pubkey: "pub", npub: "npub" };
    }
    static generate() {
      return new this();
    }
    get privateKey() {
      return "nsec";
    }
  },
  NDKRelaySet: { fromRelayUrls: () => ({}) },
  NDKUser: class {},
  NDKRelay: mockedNdk.FakeRelay,
}));

vi.mock("../relay-info", () => ({
  fetchRelayInfo: vi.fn(async () => null),
}));

vi.mock("../nip42-relay-auth-policy", () => ({
  createRelayNip42AuthPolicy: vi.fn(() => undefined),
}));

vi.mock("./session-restore", () => ({
  waitForNostrExtensionAvailability: vi.fn(async () => false),
}));

function Harness() {
  const { addRelay, removeRelay, reconnectRelay, relays } = useNDK();
  return (
    <div>
      <button onClick={() => addRelay("wss://relay.two/")}>add relay</button>
      <button onClick={() => addRelay("wss://relay.one/")}>re-add relay slash</button>
      <button onClick={() => addRelay("wss://relay.one")}>re-add relay no slash</button>
      <button onClick={() => removeRelay("wss://relay.one")}>remove relay</button>
      <button onClick={() => reconnectRelay("wss://relay.one")}>reconnect relay</button>
      <button onClick={() => reconnectRelay("wss://relay.one", { forceNewSocket: true })}>hard reconnect relay</button>
      <output data-testid="relay-state">
        {relays
          .map((relay) => `${relay.url}:${relay.status}`)
          .sort()
          .join(",")}
      </output>
    </div>
  );
}

describe("NDKProvider relay lifecycle", () => {
  beforeEach(() => {
    mockedNdk.ndkInstances.length = 0;
    window.localStorage.clear();
  });

  it("adds a relay without rebuilding the provider or reconnecting healthy relays", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    expect(mockedNdk.ndkInstances).toHaveLength(1);
    const ndk = mockedNdk.ndkInstances[0];
    const firstRelay = ndk.pool.getRelay("wss://relay.one", false);
    expect(firstRelay.connectCalls).toBe(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "add relay" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.two:connected");
    });

    expect(mockedNdk.ndkInstances).toHaveLength(1);
    expect(firstRelay.connectCalls).toBe(1);
    expect(ndk.pool.getRelay("wss://relay.two", false).connectCalls).toBe(1);
  });

  it.each(["re-add relay slash", "re-add relay no slash"] as const)(
    "re-adds a normalized relay with %s and ignores stale disconnects from the removed instance",
    async (reAddButtonLabel) => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    const ndk = mockedNdk.ndkInstances[0];
    const removedRelay = ndk.pool.getRelay("wss://relay.one", false);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "remove relay" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).not.toContain("wss://relay.one:");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: reAddButtonLabel }));
    });

    const readdedRelay = ndk.pool.getRelay("wss://relay.one", false);
    expect(readdedRelay).not.toBe(removedRelay);

    await waitFor(() => {
      const relayState = screen.getByTestId("relay-state").textContent ?? "";
      expect(relayState).toContain("wss://relay.one:connected");
      expect(relayState.match(/wss:\/\/relay\.one:/g)).toHaveLength(1);
    });

    await act(async () => {
      removedRelay.disconnect();
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });
    expect(readdedRelay.connectCalls).toBe(1);
    }
  );

  it("removes one relay without reconnecting healthy survivors", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/", "wss://relay.two/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      const relayState = screen.getByTestId("relay-state").textContent ?? "";
      expect(relayState).toContain("wss://relay.one:connected");
      expect(relayState).toContain("wss://relay.two:connected");
    });

    expect(mockedNdk.ndkInstances).toHaveLength(1);
    const ndk = mockedNdk.ndkInstances[0];
    const survivingRelay = ndk.pool.getRelay("wss://relay.two", false);
    expect(survivingRelay.connectCalls).toBe(1);
    expect(ndk.pool.getOpenSocketCount("wss://relay.two")).toBe(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "remove relay" }));
    });

    await waitFor(() => {
      const relayState = screen.getByTestId("relay-state").textContent ?? "";
      expect(relayState).not.toContain("wss://relay.one:");
      expect(relayState).toContain("wss://relay.two:connected");
    });

    expect(mockedNdk.ndkInstances).toHaveLength(1);
    expect(survivingRelay.connectCalls).toBe(1);
    expect(ndk.pool.getCreatedRelays("wss://relay.two")).toHaveLength(1);
    expect(ndk.pool.getOpenSocketCount("wss://relay.two")).toBe(1);
  });

  it("soft-reconnects a relay without creating additional sockets for the same url", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    const ndk = mockedNdk.ndkInstances[0];
    const firstRelay = ndk.pool.getRelay("wss://relay.one", false);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reconnect relay" }));
      fireEvent.click(screen.getByRole("button", { name: "reconnect relay" }));
      fireEvent.click(screen.getByRole("button", { name: "reconnect relay" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    expect(firstRelay.disconnectCalls).toBe(0);
    expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(1);
    expect(ndk.pool.getOpenSocketCount("wss://relay.one")).toBe(1);
  });

  it("hard-reconnects a relay without leaving multiple open sockets for the same url", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    const ndk = mockedNdk.ndkInstances[0];
    const firstRelay = ndk.pool.getRelay("wss://relay.one", false);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "hard reconnect relay" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    expect(firstRelay.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(2);
    expect(ndk.pool.getOpenSocketCount("wss://relay.one")).toBe(1);
  });

  it("recovers stale connecting state with no active websocket on reconnect", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    const ndk = mockedNdk.ndkInstances[0];
    const firstRelay = ndk.pool.getRelay("wss://relay.one", false);
    firstRelay.socketOpen = false;
    firstRelay.status = mockedNdk.MockNDKRelayStatus.CONNECTING;
    firstRelay.connectivity.ws = undefined;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reconnect relay" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    expect(firstRelay.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(2);
    expect(ndk.pool.getOpenSocketCount("wss://relay.one")).toBe(1);
  });

  it("marks relay read-only when websocket returns OK false with auth-required reason", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    const ndk = mockedNdk.ndkInstances[0];
    const relay = ndk.pool.getRelay("wss://relay.one", false);

    await act(async () => {
      relay.emitServerMessage(
        '["OK","event-id",false,"auth-required: event author pubkey not in whitelist"]'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:read-only");
    });
  });

  it("keeps relay read-only across soft reconnect until write succeeds", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    const ndk = mockedNdk.ndkInstances[0];
    const relay = ndk.pool.getRelay("wss://relay.one", false);

    await act(async () => {
      relay.emitServerMessage(
        '["OK","event-id",false,"auth-required: event author pubkey not in whitelist"]'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:read-only");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reconnect relay" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:read-only");
    });
  });

  it("marks relay verification-failed when websocket returns CLOSED auth-required reason", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    const ndk = mockedNdk.ndkInstances[0];
    const relay = ndk.pool.getRelay("wss://relay.one", false);

    await act(async () => {
      relay.emitServerMessage('["CLOSED","kinds-limit-subid","auth-required: pubkey not in whitelist"]');
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:verification-failed");
    });
  });
});
