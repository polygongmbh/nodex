import { useMemo } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NDKEvent, NDKFilter, NDKRelay, NDKSubscription } from "@nostr-dev-kit/ndk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_RELAYS_SCOPE_KEY,
  NOSTR_EVENT_CACHE_SCOPE_PREFIX,
  NOSTR_EVENT_CACHE_STORAGE_KEY,
} from "@/infrastructure/nostr/event-cache";
import {
  buildFeedScopeKey,
  buildLiveSubscriptionFilters,
  drainPendingCachedEvents,
  getFlushDelayMs,
  getNostrEventsQueryKey,
  NOSTR_EVENTS_QUERY_KEY,
  useNostrEventCache,
} from "./use-nostr-event-cache";
import type { CachedNostrEvent } from "@/infrastructure/nostr/event-cache";

describe("nostr event cache feed scope helpers", () => {
  it("builds a stable normalized scope key from relay ids", () => {
    const scopeKey = buildFeedScopeKey(
      new Set(["Relay-B", "demo", "relay-a", "relay-b"]),
      ["relay-a", "relay-b", "demo"]
    );
    expect(scopeKey).toBe("relay-a,relay-b");
  });

  it("uses all scope when only demo relay is active", () => {
    const scopeKey = buildFeedScopeKey(new Set(["demo"]), ["relay-a", "demo"]);
    expect(scopeKey).toBe(ALL_RELAYS_SCOPE_KEY);
  });

  it("builds scoped query keys from the base key", () => {
    const queryKey = getNostrEventsQueryKey("relay-a");
    expect(queryKey).toEqual([...NOSTR_EVENTS_QUERY_KEY, "relay-a"]);
  });

  it("uses short flush delay in live mode (small queue)", () => {
    expect(getFlushDelayMs(0)).toBe(64);
    expect(getFlushDelayMs(50)).toBe(64);
    expect(getFlushDelayMs(200)).toBe(64);
  });

  it("uses long flush delay in burst mode (large queue)", () => {
    expect(getFlushDelayMs(201)).toBe(500);
    expect(getFlushDelayMs(1000)).toBe(500);
  });

  it("drains cached events in bounded hydration batches", () => {
    const previous = [{
      id: "existing",
      pubkey: "pubkey-existing",
      created_at: 10,
      kind: 1,
      tags: [],
      content: "existing",
    }];
    const pending = [
      {
        id: "event-3",
        pubkey: "pubkey-3",
        created_at: 30,
        kind: 1,
        tags: [],
        content: "third",
      },
      {
        id: "event-2",
        pubkey: "pubkey-2",
        created_at: 20,
        kind: 1,
        tags: [],
        content: "second",
      },
    ];

    const drained = drainPendingCachedEvents(previous, pending, 1);

    expect(drained.flushedCount).toBe(1);
    expect(drained.remaining).toEqual([pending[1]]);
    expect(drained.nextEvents.map((event) => event.id)).toEqual(["event-3", "existing"]);
  });

  it("bounds live subscriptions to the latest cached event when cache exists", () => {
    expect(buildLiveSubscriptionFilters([1, 30023], [
      {
        id: "cached-1",
        pubkey: "pubkey-1",
        created_at: 1_700_000_100,
        kind: 1,
        tags: [],
        content: "cached",
      },
    ], 1_700_000_200)).toEqual([
      {
        kinds: [1, 30023],
        since: 1_700_000_040,
      },
    ]);
  });

  it("uses the cache retention window for cold-start live subscriptions", () => {
    expect(buildLiveSubscriptionFilters([1], [], 1_700_000_200)).toEqual([
      {
        kinds: [1],
        since: 1_699_395_400,
      },
    ]);
  });
});

type SubscriptionEventName = "eose" | "close" | "event:dup";

interface MockSubscriptionControls {
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
  emitEvent: (event: NDKEvent) => void;
  emitDuplicateEvent: (event: NDKEvent, relayUrl: string) => void;
  emit: (eventName: SubscriptionEventName) => void;
}

function makeNostrEvent(id: string, relayUrls: string[] = ["wss://relay.one/"]): NDKEvent {
  const normalizedRelayUrls = relayUrls.map((relayUrl) => relayUrl.replace(/\/+$/, ""));
  return {
    id,
    pubkey: `pubkey-${id}`,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: `content-${id}`,
    relay: { url: relayUrls[0] },
    onRelays: normalizedRelayUrls.map((relayUrl) => ({ url: relayUrl })),
  } as unknown as NDKEvent;
}

function createMockSubscriptionControls(): MockSubscriptionControls {
  const listeners: Partial<Record<SubscriptionEventName, (...args: unknown[]) => void>> = {};
  let onEvent: ((event: NDKEvent) => void) | null = null;
  let isClosed = false;
  let closeOnEose = false;

  const subscription: NDKSubscription = {
    on: ((eventName: string, callback: (...args: unknown[]) => void) => {
      if (eventName === "eose" || eventName === "close" || eventName === "event:dup") {
        listeners[eventName] = callback;
      }
    }) as unknown as NDKSubscription["on"],
    stop: vi.fn(() => {
      isClosed = true;
    }),
  } as NDKSubscription;

  const subscribe = vi.fn((
    _filters: NDKFilter[],
    callback: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => {
    onEvent = callback;
    isClosed = false;
    closeOnEose = options?.closeOnEose ?? false;
    return subscription;
  });

  return {
    subscribe,
    emitEvent: (event: NDKEvent) => {
      if (isClosed || !onEvent) return;
      onEvent(event);
    },
    emitDuplicateEvent: (event: NDKEvent, relayUrl: string) => {
      if (isClosed) return;
      listeners["event:dup"]?.(event, { url: relayUrl } satisfies Partial<NDKRelay>);
    },
    emit: (eventName: SubscriptionEventName) => {
      listeners[eventName]?.();
      if (eventName === "eose" && closeOnEose) {
        isClosed = true;
      }
      if (eventName === "close") {
        isClosed = true;
      }
    },
  };
}

function Harness({ subscribe }: { subscribe: MockSubscriptionControls["subscribe"] }) {
  const subscribedKinds = useMemo(() => [1], []);
  const result = useNostrEventCache({
    isConnected: true,
    subscribedKinds,
    activeRelayIds: new Set(["relay-one"]),
    availableRelayIds: ["relay-one"],
    subscribe,
  });

  return (
    <>
      <output data-testid="hydrating">{String(result.isHydrating)}</output>
      <output data-testid="event-ids">
        {result.events.map((event: CachedNostrEvent) => event.id).join(",")}
      </output>
      <output data-testid="relay-urls">
        {result.events.map((event: CachedNostrEvent) => (event.relayUrls || []).join("|")).join(",")}
      </output>
    </>
  );
}

describe("useNostrEventCache live subscription behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps receiving events after EOSE and requests a persistent subscription", async () => {
    const controls = createMockSubscriptionControls();
    const queryClient = new QueryClient();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_200_000);

    render(
      <QueryClientProvider client={queryClient}>
        <Harness subscribe={controls.subscribe} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(controls.subscribe).toHaveBeenCalled());
    expect(controls.subscribe).toHaveBeenLastCalledWith(
      [{ kinds: [1], since: 1_699_395_400 }],
      expect.any(Function),
      { closeOnEose: false }
    );

    await waitFor(() => {
      expect(screen.getByTestId("hydrating").textContent).toBe("true");
    });

    act(() => {
      controls.emit("eose");
    });

    await waitFor(() => {
      expect(screen.getByTestId("hydrating").textContent).toBe("false");
    });

    act(() => {
      controls.emitEvent(makeNostrEvent("post-eose-event"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("event-ids").textContent).toContain("post-eose-event");
    });
  });

  it("merges relay URLs when duplicate deliveries arrive from another relay", async () => {
    const controls = createMockSubscriptionControls();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <Harness subscribe={controls.subscribe} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(controls.subscribe).toHaveBeenCalled());

    act(() => {
      controls.emitEvent(makeNostrEvent("dupe-event", ["wss://relay.one/"]));
      controls.emitDuplicateEvent(makeNostrEvent("dupe-event", ["wss://relay.one/"]), "wss://relay.two/");
      controls.emit("eose");
    });

    await waitFor(() => {
      expect(screen.getByTestId("event-ids").textContent).toBe("dupe-event");
    });

    await waitFor(() => {
      expect(screen.getByTestId("relay-urls").textContent).toBe("wss://relay.one|wss://relay.two");
    });
  });

  it("does not persist cache updates before the debounce window after a live flush", async () => {
    vi.useFakeTimers();
    const controls = createMockSubscriptionControls();
    const queryClient = new QueryClient();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <QueryClientProvider client={queryClient}>
        <Harness subscribe={controls.subscribe} />
      </QueryClientProvider>
    );

    expect(controls.subscribe).toHaveBeenCalled();

    act(() => {
      controls.emitEvent(makeNostrEvent("debounced-event"));
      vi.advanceTimersByTime(64);
    });

    expect(screen.getByTestId("event-ids").textContent).toContain("debounced-event");

    const cacheWritesBeforeDebounce = setItemSpy.mock.calls.filter(([key]) => {
      return key === NOSTR_EVENT_CACHE_STORAGE_KEY || String(key).startsWith(NOSTR_EVENT_CACHE_SCOPE_PREFIX);
    });
    expect(cacheWritesBeforeDebounce).toHaveLength(0);

    setItemSpy.mockRestore();
  });
});
