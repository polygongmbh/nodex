import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { NDKProvider, useNDK } from "./ndk-provider";
import { fetchRelayInfo } from "../relay-info";
import { RELAY_STATUS_CACHE_STORAGE_KEY } from "@/infrastructure/preferences/storage-registry";
import { NostrEventKind } from "@/lib/nostr/types";
import { STORAGE_KEY_AUTH, STORAGE_KEY_SESSION_NOAS_STATE, STORAGE_KEY_SESSION_PRIVATE_KEY } from "./storage";

const mockedNdk = vi.hoisted(() => {
  interface NdkLike {
    pool: FakePool;
    signer: unknown;
    relayAuthDefaultPolicy: unknown;
    subManager: { subscriptions: Map<string, unknown> };
    connect(): Promise<void>;
    subscribeCalls: Array<{ filters: unknown; options: unknown }>;
    subscribe(): { on(): void; stop(): void };
  }

  const ndkInstances: NdkLike[] = [];
  const publishedEvents: Array<{ kind?: number; content?: string; tags?: string[][]; relayUrls: string[] }> = [];
  const relayConnectModes = new Map<string, "success" | "hang">();

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
    subscribeCalls: Array<{ subscription: unknown; filters: unknown }> = [];
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
      if (relayConnectModes.get(this.url) === "hang") {
        return;
      }
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

    subscribe(subscription: unknown, filters: unknown) {
      this.subscribeCalls.push({ subscription, filters });
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
    subManager: { subscriptions: Map<string, unknown> };
    subscribeCalls: Array<{ filters: unknown; options: unknown }>;
    private subscriptionCounter = 0;

    constructor(options: { explicitRelayUrls?: string[] }) {
      this.pool = new FakePool(options.explicitRelayUrls ?? []);
      this.signer = undefined;
      this.relayAuthDefaultPolicy = undefined;
      this.subManager = { subscriptions: new Map() };
      this.subscribeCalls = [];
      ndkInstances.push(this);
    }

    async connect() {
      this.pool.connectAll();
    }

    subscribe(filters?: unknown, options?: unknown) {
      this.subscribeCalls.push({ filters, options });
      const normalizedFilters = Array.isArray(filters) ? filters : [];
      const relayFilters = new Map<string, unknown[]>();
      this.pool.relays.forEach((_relay, relayUrl) => {
        relayFilters.set(relayUrl, normalizedFilters);
      });
      const internalId = `sub-${this.subscriptionCounter++}`;
      const fakeSubscription = {
        internalId,
        filters: normalizedFilters,
        relayFilters,
        on() {},
        stop: () => {
          this.subManager.subscriptions.delete(internalId);
        },
      };
      this.subManager.subscriptions.set(internalId, fakeSubscription);
      return fakeSubscription;
    }
  }

  return {
    FakeNDK,
    FakeRelay,
    MockNDKRelayStatus,
    ndkInstances,
    publishedEvents,
    relayConnectModes,
  };
});

const noasClientModule = vi.hoisted(() => {
  class MockNoasClient {
    signIn = vi.fn(async () => noasClientModule.nextSignInResponse);
    register = vi.fn(async () => noasClientModule.nextRegisterResponse);
    getProfilePicture = vi.fn(async () => ({}));
    decryptPrivateKey = vi.fn(async () => "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef");
  }

  return {
    instances: [] as MockNoasClient[],
    nextSignInResponse: {
      success: true,
      publicKey: "pub",
      encryptedPrivateKey: "ncryptsec1example",
    },
    nextRegisterResponse: {
      success: true,
      user: { username: "alice", publicKey: "pub" },
      status: "active",
      message: "Account activated.",
    },
    resolveNoasApiBaseUrl: vi.fn(async () => "https://noas.example/api/v1"),
    normalizeNoasBaseUrl: vi.fn((value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return "";
      return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed.replace(/\/+$/, "") : `https://${trimmed}`.replace(/\/+$/, "");
    }),
    isValidNoasBaseUrl: vi.fn((value: string) => Boolean(value)),
    NoasClient: vi.fn().mockImplementation(() => {
      const instance = new MockNoasClient();
      noasClientModule.instances.push(instance);
      return instance;
    }),
  };
});

vi.mock("@nostr-dev-kit/ndk", () => ({
  __esModule: true,
  default: mockedNdk.FakeNDK,
  NDKRelayStatus: mockedNdk.MockNDKRelayStatus,
  NDKSubscriptionCacheUsage: {
    ONLY_RELAY: "ONLY_RELAY",
  },
  NDKEvent: class {
    kind?: number;
    content = "";
    tags: string[][] = [];
    id = `mock-event-${Math.random().toString(36).slice(2, 10)}`;

    async sign() {
      return undefined;
    }

    async publish(relaySet: { relayUrls?: string[] }) {
      const relayUrls = relaySet.relayUrls ?? [];
      mockedNdk.publishedEvents.push({
        kind: this.kind,
        content: this.content,
        tags: this.tags,
        relayUrls,
      });
      return new Set(relayUrls.map((relayUrl) => ({ url: relayUrl })));
    }
  },
  NDKNip07Signer: class {},
  NDKNip46Signer: { bunker: () => ({ blockUntilReady: async () => ({ fetchProfile: async () => {}, pubkey: "pub", npub: "npub" }) }) },
  NDKPrivateKeySigner: class {
    async user(): Promise<{
      pubkey: string;
      npub: string;
      fetchProfile: () => Promise<void>;
      profile: undefined;
    }> {
      return { pubkey: "pub", npub: "npub", fetchProfile: async () => {}, profile: undefined };
    }
    static generate() {
      return new this();
    }
    get privateKey() {
      return "nsec";
    }
  },
  NDKRelaySet: { fromRelayUrls: (relayUrls: string[]) => ({ relayUrls }) },
  NDKUser: class {},
  NDKRelay: mockedNdk.FakeRelay,
}));

vi.mock("@/lib/nostr/noas-client", () => ({
  NoasClient: noasClientModule.NoasClient,
}));

vi.mock("@/lib/nostr/noas-discovery", () => ({
  resolveNoasApiBaseUrl: noasClientModule.resolveNoasApiBaseUrl,
  normalizeNoasBaseUrl: noasClientModule.normalizeNoasBaseUrl,
  isValidNoasBaseUrl: noasClientModule.isValidNoasBaseUrl,
}));

vi.mock("../relay-info", () => ({
  fetchRelayInfo: vi.fn(async () => null),
  summarizeRelayInfo: (doc: { supported_nips?: number[]; limitation?: { auth_required?: boolean }; limitations?: { auth_required?: boolean } }) => {
    const authRequired = Boolean(doc.limitations?.auth_required ?? doc.limitation?.auth_required);
    return {
      authRequired,
      supportsNip42: (doc.supported_nips ?? []).includes(42) || authRequired,
    };
  },
}));

vi.mock("../nip42-relay-auth-policy", () => ({
  createRelayNip42AuthPolicy: vi.fn(() => undefined),
}));

vi.mock("./session-restore", () => ({
  waitForNostrExtensionAvailability: vi.fn(async () => false),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function Harness() {
  const {
    addRelay,
    removeRelay,
    reconnectRelay,
    loginAsGuest,
    logout,
    publishEvent,
    relays,
    setPresenceRelayUrls,
  } = useNDK();
  return (
    <div>
      <button onClick={() => addRelay("wss://relay.two/")}>add relay</button>
      <button onClick={() => addRelay("wss://relay.one/")}>re-add relay slash</button>
      <button onClick={() => addRelay("wss://relay.one")}>re-add relay no slash</button>
      <button onClick={() => removeRelay("wss://relay.one")}>remove relay</button>
      <button onClick={() => reconnectRelay("wss://relay.one")}>reconnect relay</button>
      <button onClick={() => reconnectRelay("wss://relay.one", { forceNewSocket: true })}>hard reconnect relay</button>
      <button onClick={() => setPresenceRelayUrls(["wss://relay.two"])}>set presence relays</button>
      <button onClick={() => setPresenceRelayUrls(["wss://relay.one", "wss://relay.two"])}>set all presence relays</button>
      <button onClick={() => logout()}>logout</button>
      <button onClick={() => void loginAsGuest()}>login as guest</button>
      <button
        onClick={() => {
          void publishEvent(
            NostrEventKind.TextNote,
            "hello",
            [],
            undefined,
            ["wss://relay.one", "wss://relay.two"]
          );
        }}
      >
        publish to both relays
      </button>
      <output data-testid="relay-state">
        {relays
          .map((relay) => `${relay.url}:${relay.status}`)
          .sort()
          .join(",")}
      </output>
      <output data-testid="relay-nip11">
        {relays
          .map((relay) => `${relay.url}:${relay.nip11?.authRequired ? "auth" : "no-auth"}`)
          .sort()
          .join(",")}
      </output>
    </div>
  );
}

function SubscribeIdentityHarness() {
  const { relays, subscribe } = useNDK();
  const previousSubscribeRef = useRef(subscribe);
  const [subscribeIdentityChanges, setSubscribeIdentityChanges] = useState(0);

  useEffect(() => {
    if (previousSubscribeRef.current === subscribe) return;
    previousSubscribeRef.current = subscribe;
    setSubscribeIdentityChanges((count) => count + 1);
  }, [subscribe]);

  return (
    <div>
      <output data-testid="relay-state">
        {relays
          .map((relay) => `${relay.url}:${relay.status}`)
          .sort()
          .join(",")}
      </output>
      <output data-testid="subscribe-identity-changes">{String(subscribeIdentityChanges)}</output>
    </div>
  );
}

function AuthReplayHarness() {
  const { relays, subscribe, loginAsGuest, reconnectRelay } = useNDK();
  return (
    <div>
      <button
        onClick={() => {
          const feedFilters = [{ kinds: [1, 1621, 0], limit: 1500 }] as unknown as Parameters<typeof subscribe>[0];
          subscribe(feedFilters, () => {}, { closeOnEose: false });
        }}
      >
        start feed sub
      </button>
      <button onClick={() => void loginAsGuest()}>login as guest</button>
      <button onClick={() => reconnectRelay("wss://relay.one")}>reconnect relay</button>
      <output data-testid="relay-state">
        {relays
          .map((relay) => `${relay.url}:${relay.status}`)
          .sort()
          .join(",")}
      </output>
    </div>
  );
}

function NoasHostHarness() {
  const { defaultNoasHostUrl } = useNDK();
  return <output data-testid="default-noas-host">{defaultNoasHostUrl}</output>;
}

function NoasSignupHarness() {
  const { authMethod, signupWithNoas, user } = useNDK();
  const [result, setResult] = useState<string>("");

  return (
    <div>
      <button
        onClick={() => {
          void signupWithNoas(
            "alice",
            "hunter2",
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "pub"
          ).then((value) => setResult(JSON.stringify(value)));
        }}
      >
        sign up with noas
      </button>
      <output data-testid="signup-result">{result}</output>
      <output data-testid="auth-method">{authMethod ?? ""}</output>
      <output data-testid="user-pubkey">{user?.pubkey ?? ""}</output>
    </div>
  );
}

function AuthSessionHarness() {
  const { authMethod, loginWithNoas, loginWithPrivateKey, user } = useNDK();

  return (
    <div>
      <button onClick={() => void loginWithPrivateKey("nsec1privatekey")}>login with private key</button>
      <button onClick={() => void loginWithNoas("alice", "hunter2")}>login with noas</button>
      <output data-testid="auth-method">{authMethod ?? ""}</output>
      <output data-testid="user-pubkey">{user?.pubkey ?? ""}</output>
      <output data-testid="user-name">{user?.profile?.name ?? ""}</output>
      <output data-testid="user-picture">{user?.profile?.picture ?? ""}</output>
    </div>
  );
}

describe("NDKProvider relay lifecycle", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockedNdk.ndkInstances.length = 0;
    mockedNdk.publishedEvents.length = 0;
    mockedNdk.relayConnectModes.clear();
    noasClientModule.instances.length = 0;
    noasClientModule.nextSignInResponse = {
      success: true,
      publicKey: "pub",
      encryptedPrivateKey: "ncryptsec1example",
    };
    noasClientModule.nextRegisterResponse = {
      success: true,
      user: { username: "alice", publicKey: "pub" },
      status: "active",
      message: "Account activated.",
    };
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.mocked(fetchRelayInfo).mockReset();
    vi.mocked(fetchRelayInfo).mockResolvedValue(null);
    vi.mocked(toast.success).mockReset();
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

  it("exposes the startup-resolved default Noas host through context", async () => {
    render(
      <NDKProvider
        defaultRelays={["wss://relay.one/"]}
        defaultNoasHostUrl="https://example.com"
      >
        <NoasHostHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("default-noas-host")).toHaveTextContent("https://example.com");
    });
  });

  it("keeps successful non-active Noas signup out of the authenticated session", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]} defaultNoasHostUrl="https://noas.example">
        <NoasSignupHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("");
    });

    noasClientModule.nextRegisterResponse = {
      success: true,
      user: { username: "alice", publicKey: "pub" },
      status: "pending_email_verification",
      message: "Check your inbox.",
    };

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sign up with noas" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("signup-result")).toHaveTextContent("\"registrationSucceeded\":true");
    });
    expect(screen.getByTestId("signup-result")).toHaveTextContent("\"status\":\"pending_email_verification\"");
    expect(screen.getByTestId("signup-result")).toHaveTextContent("\"message\":\"Check your inbox.\"");
    expect(screen.getByTestId("auth-method")).toHaveTextContent("");
    expect(screen.getByTestId("user-pubkey")).toHaveTextContent("");
  });

  it("sends currently connected relays when signing up with Noas", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/", "wss://relay.two/"]} defaultNoasHostUrl="https://noas.example">
        <NoasSignupHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      const relayState = mockedNdk.ndkInstances[0]?.pool.relays;
      expect(relayState?.get("wss://relay.one")?.status).toBe(mockedNdk.MockNDKRelayStatus.CONNECTED);
      expect(relayState?.get("wss://relay.two")?.status).toBe(mockedNdk.MockNDKRelayStatus.CONNECTED);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "sign up with noas" }));
    });

    const noasClient = noasClientModule.instances.at(-1);
    expect(noasClient?.register).toHaveBeenCalledWith(
      "alice",
      "hunter2",
      expect.stringMatching(/^nsec1/),
      "pub",
      expect.objectContaining({
        relays: ["wss://relay.one", "wss://relay.two"],
      })
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("stores private-key auth in session storage and restores it on reload", async () => {
    const { unmount } = render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <AuthSessionHarness />
      </NDKProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login with private key" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("privateKey");
    });
    expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY_AUTH)).toBe("privateKey");
    expect(window.sessionStorage.getItem(STORAGE_KEY_SESSION_PRIVATE_KEY)).toBe("nsec1privatekey");
    expect(toast.success).toHaveBeenCalledTimes(1);

    unmount();

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <AuthSessionHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("privateKey");
    });
    expect(screen.getByTestId("user-pubkey")).toHaveTextContent("pub");
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it("stores Noas auth in session storage and restores it on reload", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]} defaultNoasHostUrl="https://noas.example">
        <AuthSessionHarness />
      </NDKProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login with noas" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("noas");
    });
    expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
    expect(window.localStorage.getItem("nostr_noas_username")).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY_AUTH)).toBe("noas");
    expect(window.sessionStorage.getItem(STORAGE_KEY_SESSION_PRIVATE_KEY)).toMatch(/^nsec/);
    expect(window.sessionStorage.getItem(STORAGE_KEY_SESSION_NOAS_STATE)).toContain("\"username\":\"alice\"");
    expect(screen.getByTestId("user-picture")).toHaveTextContent("https://noas.example/api/v1/picture/pub");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("shows the login success toast again when a Noas session is restored after reload", async () => {
    const { unmount } = render(
      <NDKProvider defaultRelays={["wss://relay.one/"]} defaultNoasHostUrl="https://noas.example">
        <AuthSessionHarness />
      </NDKProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login with noas" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("noas");
    });
    expect(toast.success).toHaveBeenCalledTimes(1);

    unmount();

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <AuthSessionHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("noas");
    });
    expect(toast.success).toHaveBeenCalledTimes(2);
  });

  it("restores a Noas session from session storage without a fresh sign-in", async () => {
    window.sessionStorage.setItem(STORAGE_KEY_AUTH, "noas");
    window.sessionStorage.setItem(STORAGE_KEY_SESSION_PRIVATE_KEY, "nsec1restored");
    window.sessionStorage.setItem(STORAGE_KEY_SESSION_NOAS_STATE, JSON.stringify({
      apiBaseUrl: "https://noas.example/api/v1",
      username: "alice",
      relayUrls: ["wss://relay.one"],
    }));

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <AuthSessionHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("noas");
    });
    expect(screen.getByTestId("user-name")).toHaveTextContent("alice");
    expect(screen.getByTestId("user-picture")).toHaveTextContent("https://noas.example/api/v1/picture/pub");
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it("clears stale legacy private-key auth without session material", async () => {
    window.localStorage.setItem(STORAGE_KEY_AUTH, "privateKey");

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <AuthSessionHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-method")).toHaveTextContent("");
    });
    expect(window.localStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY_AUTH)).toBeNull();
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

  it("retries a startup connection that stays stuck connecting without moving to connection-error", async () => {
    vi.useFakeTimers();
    mockedNdk.relayConnectModes.set("wss://relay.one", "hang");

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connecting");
    const ndk = mockedNdk.ndkInstances[0];
    const firstRelay = ndk.pool.getRelay("wss://relay.one", false);

    mockedNdk.relayConnectModes.set("wss://relay.one", "success");

    await act(async () => {
      vi.advanceTimersByTime(15000);
      await Promise.resolve();
    });

    expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:disconnected");

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    expect(screen.getByTestId("relay-state").textContent).not.toContain("connection-error");
    expect(firstRelay.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(2);
    vi.useRealTimers();
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

  it("retries auth for read-only relays on reconnect without forcing a new socket", async () => {
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
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
    });

    await act(async () => {
      relay.emitServerMessage(
        '["OK","event-id",false,"auth-required: event author pubkey not in whitelist"]'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:read-only");
    });

    const subscribeCallsBeforeReconnect = ndk.subscribeCalls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reconnect relay" }));
    });

    await waitFor(() => {
      expect(ndk.subscribeCalls.length).toBeGreaterThan(subscribeCallsBeforeReconnect);
    });

    expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(1);
    expect(relay.disconnectCalls).toBe(0);

    await act(async () => {
      ndk.pool.emit("relay:authed", relay);
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
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

  it("ignores auth rejection frames from a stale relay socket after a hard reconnect", async () => {
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
      expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(2);
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    await act(async () => {
      firstRelay.emitServerMessage('["CLOSED","kinds-limit-subid","auth-required: pubkey not in whitelist"]');
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });
  });

  it("retries verification-failed relays after signing in again without forcing a new socket", async () => {
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
      firstRelay.emitServerMessage('["CLOSED","kinds-limit-subid","auth-required: pubkey not in whitelist"]');
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:verification-failed");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "logout" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
    });

    await waitFor(() => {
      expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(1);
      expect(firstRelay.disconnectCalls).toBe(0);
      expect(ndk.pool.getOpenSocketCount("wss://relay.one")).toBe(1);
    });
  });

  it("retries auth and replays subscriptions for verification-failed relays on reconnect", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <AuthReplayHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
      fireEvent.click(screen.getByRole("button", { name: "start feed sub" }));
    });

    const ndk = mockedNdk.ndkInstances[0];
    const relay = ndk.pool.getRelay("wss://relay.one", false);

    await act(async () => {
      relay.emitServerMessage('["CLOSED","kinds-limit-subid","auth-required: pubkey not in whitelist"]');
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:verification-failed");
    });

    const subscribeCallsBeforeReconnect = ndk.subscribeCalls.length;
    const replayedSubscriptionsBeforeAuth = relay.subscribeCalls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "reconnect relay" }));
    });

    await waitFor(() => {
      expect(ndk.subscribeCalls.length).toBeGreaterThan(subscribeCallsBeforeReconnect);
    });

    expect(ndk.pool.getCreatedRelays("wss://relay.one")).toHaveLength(1);
    expect(relay.disconnectCalls).toBe(0);

    await act(async () => {
      ndk.pool.emit("relay:authed", relay);
    });

    await waitFor(() => {
      expect(relay.subscribeCalls.length).toBeGreaterThan(replayedSubscriptionsBeforeAuth);
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });
  });

  it("publishes logout offline presence only to the registered presence relays", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/", "wss://relay.two/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.two:connected");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "set presence relays" }));
      fireEvent.click(screen.getByRole("button", { name: "logout" }));
    });

    await waitFor(() => {
      expect(mockedNdk.publishedEvents).toContainEqual(
        expect.objectContaining({
          kind: 30315,
          relayUrls: ["wss://relay.two"],
        })
      );
    });
  });

  it("skips read-only relays when publishing with an explicit relay target list", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/", "wss://relay.two/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.two:connected");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
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

    mockedNdk.publishedEvents.length = 0;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "publish to both relays" }));
    });

    await waitFor(() => {
      expect(mockedNdk.publishedEvents).toContainEqual(
        expect.objectContaining({
          kind: NostrEventKind.TextNote,
          relayUrls: ["wss://relay.two"],
        })
      );
    });
  });

  it("skips read-only relays when publishing logout offline presence", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/", "wss://relay.two/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.two:connected");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
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

    mockedNdk.publishedEvents.length = 0;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "set all presence relays" }));
      fireEvent.click(screen.getByRole("button", { name: "logout" }));
    });

    await waitFor(() => {
      expect(mockedNdk.publishedEvents).toContainEqual(
        expect.objectContaining({
          kind: NostrEventKind.UserStatus,
          relayUrls: ["wss://relay.two"],
        })
      );
    });
  });

  it("preloads cached nip11 relay auth metadata on startup and skips fresh probe", async () => {
    const fetchedAt = Date.now();
    window.localStorage.setItem(RELAY_STATUS_CACHE_STORAGE_KEY, JSON.stringify({
      "wss://relay.one": {
        nip11: {
          authRequired: true,
          supportsNip42: true,
          fetchedAt,
        },
      },
    }));

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
      expect(screen.getByTestId("relay-nip11").textContent).toContain("wss://relay.one:auth");
    });

    expect(fetchRelayInfo).not.toHaveBeenCalled();
  });

  it("keeps subscribe callback identity stable across relay status updates", async () => {
    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <SubscribeIdentityHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });
    const baselineIdentityChanges = Number(
      screen.getByTestId("subscribe-identity-changes").textContent ?? "0"
    );

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

    const afterStatusUpdateIdentityChanges = Number(
      screen.getByTestId("subscribe-identity-changes").textContent ?? "0"
    );
    expect(afterStatusUpdateIdentityChanges).toBe(baselineIdentityChanges);
  });

  it("reruns auth preflight on sign-in for connected relays that support nip-42", async () => {
    const fetchedAt = Date.now();
    window.localStorage.setItem(RELAY_STATUS_CACHE_STORAGE_KEY, JSON.stringify({
      "wss://relay.one": {
        nip11: {
          authRequired: true,
          supportsNip42: true,
          fetchedAt,
        },
      },
    }));

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <Harness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
      expect(screen.getByTestId("relay-nip11").textContent).toContain("wss://relay.one:auth");
    });

    const ndk = mockedNdk.ndkInstances[0];
    ndk.subscribeCalls.length = 0;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
    });

    await waitFor(() => {
      expect(ndk.subscribeCalls.some((call) => {
        const options = (call.options || {}) as { closeOnEose?: boolean; relayUrls?: string[] };
        return options.closeOnEose === true
          && Array.isArray(options.relayUrls)
          && options.relayUrls.includes("wss://relay.one");
      })).toBe(true);
    });
  });

  it("replays active subscriptions after relay auth succeeds on sign-in", async () => {
    const fetchedAt = Date.now();
    window.localStorage.setItem(RELAY_STATUS_CACHE_STORAGE_KEY, JSON.stringify({
      "wss://relay.one": {
        nip11: {
          authRequired: true,
          supportsNip42: true,
          fetchedAt,
        },
      },
    }));

    render(
      <NDKProvider defaultRelays={["wss://relay.one/"]}>
        <AuthReplayHarness />
      </NDKProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("relay-state").textContent).toContain("wss://relay.one:connected");
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "start feed sub" }));
    });

    const ndk = mockedNdk.ndkInstances[0];
    expect(ndk.subManager.subscriptions.size).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "login as guest" }));
    });

    const relay = ndk.pool.getRelay("wss://relay.one", false);
    const subscribeCallsBeforeAuth = relay.subscribeCalls.length;

    await act(async () => {
      ndk.pool.emit("relay:authed", relay);
    });

    await waitFor(() => {
      expect(relay.subscribeCalls.length).toBeGreaterThan(subscribeCallsBeforeAuth);
    });

    const replayedKinds = relay.subscribeCalls
      .map((call) => (call.filters as Array<{ kinds?: number[] }> | undefined)?.[0]?.kinds ?? [])
      .filter((kinds): kinds is number[] => Array.isArray(kinds));
    expect(
      replayedKinds.some((kinds) => [1, 1621, 0].every((kind) => kinds.includes(kind)))
    ).toBe(true);
  });
});
