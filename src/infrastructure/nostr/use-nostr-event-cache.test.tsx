import { useMemo } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NDKEvent, NDKFilter, NDKSubscription } from "@nostr-dev-kit/ndk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_RELAYS_SCOPE_KEY } from "@/infrastructure/nostr/event-cache";
import {
  buildFeedScopeKey,
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
});

type SubscriptionEventName = "eose" | "close";

interface MockSubscriptionControls {
  subscribe: (
    filters: NDKFilter[],
    onEvent: (event: NDKEvent) => void,
    options?: { closeOnEose?: boolean }
  ) => NDKSubscription | null;
  emitEvent: (event: NDKEvent) => void;
  emit: (eventName: SubscriptionEventName) => void;
}

function makeNostrEvent(id: string): NDKEvent {
  return {
    id,
    pubkey: `pubkey-${id}`,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: `content-${id}`,
    relay: { url: "wss://relay.one/" },
  } as unknown as NDKEvent;
}

function createMockSubscriptionControls(): MockSubscriptionControls {
  const listeners: Partial<Record<SubscriptionEventName, () => void>> = {};
  let onEvent: ((event: NDKEvent) => void) | null = null;
  let isClosed = false;
  let closeOnEose = false;

  const subscription: NDKSubscription = {
    on: ((eventName: string, callback: (...args: unknown[]) => void) => {
      if (eventName === "eose" || eventName === "close") {
        listeners[eventName] = callback as () => void;
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
    </>
  );
}

describe("useNostrEventCache live subscription behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps receiving events after EOSE and requests a persistent subscription", async () => {
    const controls = createMockSubscriptionControls();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <Harness subscribe={controls.subscribe} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(controls.subscribe).toHaveBeenCalled());
    expect(controls.subscribe).toHaveBeenLastCalledWith(
      [{ kinds: [1] }],
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
});
