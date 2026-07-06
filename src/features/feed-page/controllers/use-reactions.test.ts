import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  bootstrapReactions,
  getReactionsForTarget,
  __resetReactionsRegistryForTests,
} from "@/features/feed-page/stores/reactions-registry";

const publishEvent = vi.fn();
let mockUser: { pubkey: string } | null = { pubkey: "viewer-pk" };

// A minimal fake NDK subscription the reaction batcher can drive. Each subscribe
// call records its filters and exposes emit()/stop() so tests can simulate the
// relay stream and assert lifecycle.
interface FakeSub {
  filters: Array<{ kinds?: number[]; "#e"?: string[] }>;
  listeners: Map<string, Array<(...args: unknown[]) => void>>;
  stopped: boolean;
  emit: (event: string, ...args: unknown[]) => void;
}
const subscribeCalls: FakeSub[] = [];
const fakeNdk = {
  subscribe(filters: FakeSub["filters"]) {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const sub: FakeSub & { on: (e: string, cb: (...a: unknown[]) => void) => void; stop: () => void } = {
      filters,
      listeners,
      stopped: false,
      on(event, cb) {
        const arr = listeners.get(event) ?? [];
        arr.push(cb);
        listeners.set(event, arr);
      },
      stop() {
        this.stopped = true;
      },
      emit(event, ...args) {
        listeners.get(event)?.forEach((cb) => cb(...args));
      },
    };
    subscribeCalls.push(sub);
    return sub;
  },
};

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ ndk: fakeNdk, user: mockUser, publishEvent }),
}));

// The reaction controller resolves the reacted-to post's relay ids to URLs via the feed-surface
// relay registry (id -> url), so mock it to supply that registry.
const { RELAYS } = vi.hoisted(() => ({
  RELAYS: [
    { id: "post-one", url: "wss://post-relay.one/" },
    { id: "post-two", url: "wss://post-relay.two/" },
  ],
}));
vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => ({ relays: RELAYS }),
}));

const notify = {
  notifyNeedSigninReact: vi.fn(),
  notifyReactionFailed: vi.fn(),
  notifyReactionRemoveFailed: vi.fn(),
};
vi.mock("@/lib/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications")>()),
  notifyNeedSigninReact: (...a: unknown[]) => notify.notifyNeedSigninReact(...a),
  notifyReactionFailed: (...a: unknown[]) => notify.notifyReactionFailed(...a),
  notifyReactionRemoveFailed: (...a: unknown[]) => notify.notifyReactionRemoveFailed(...a),
}));

// Imported after the mocks so the hook binds to them.
import { useReactions } from "./use-reactions";

const POST_RELAY_IDS = ["post-one", "post-two"];
const EXPECTED_URLS = ["wss://post-relay.one/", "wss://post-relay.two/"];
const TARGET = { id: "post-1", kind: NostrEventKind.TextNote, pubkey: "author-pk", relayIds: POST_RELAY_IDS };

beforeEach(() => {
  publishEvent.mockReset();
  publishEvent.mockResolvedValue({ success: true, eventId: "r1", targetRelayUrls: EXPECTED_URLS, publishedRelayUrls: EXPECTED_URLS });
  mockUser = { pubkey: "viewer-pk" };
  Object.values(notify).forEach((fn) => fn.mockClear());
  subscribeCalls.length = 0;
  __resetReactionsRegistryForTests();
});

describe("useReactions.ensureReactionsFetched (batching)", () => {
  it("coalesces per-target fetches from a mount burst into one merged REQ", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useReactions());
      act(() => {
        result.current.ensureReactionsFetched("post-a");
        result.current.ensureReactionsFetched("post-b");
        result.current.ensureReactionsFetched("post-c");
      });
      expect(subscribeCalls).toHaveLength(0); // nothing until the flush timer fires
      act(() => {
        vi.advanceTimersByTime(60);
      });
      expect(subscribeCalls).toHaveLength(1);
      expect(subscribeCalls[0].filters[0]).toEqual({
        kinds: [NostrEventKind.Reaction],
        "#e": ["post-a", "post-b", "post-c"],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("merges received reactions and stops the sub on eose", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useReactions());
      act(() => {
        result.current.ensureReactionsFetched("post-x");
        vi.advanceTimersByTime(60);
      });
      const sub = subscribeCalls[0];
      act(() => {
        sub.emit("event", { id: "r-x", pubkey: "someone", kind: NostrEventKind.Reaction, tags: [["e", "post-x"]], content: "👍" });
        sub.emit("eose");
      });
      expect(sub.stopped).toBe(true);
      expect(getReactionsForTarget("post-x")?.totals["👍"]).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the sub and allows retry when the relay CLOSEs instead of EOSEing", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useReactions());
      act(() => {
        result.current.ensureReactionsFetched("post-y");
        vi.advanceTimersByTime(60);
      });
      const first = subscribeCalls[0];
      act(() => {
        first.emit("closed", {}, "auth-required");
      });
      expect(first.stopped).toBe(true);
      // Un-stamped on a non-EOSE end → a fresh mount re-batches it.
      act(() => {
        result.current.ensureReactionsFetched("post-y");
        vi.advanceTimersByTime(60);
      });
      expect(subscribeCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops a sub that never EOSEs after the timeout", () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useReactions());
      act(() => {
        result.current.ensureReactionsFetched("post-z");
        vi.advanceTimersByTime(60);
      });
      const sub = subscribeCalls[0];
      expect(sub.stopped).toBe(false);
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(sub.stopped).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useReactions.react", () => {
  it("resolves the post's relay ids and publishes the reaction there", async () => {
    const { result } = renderHook(() => useReactions());
    const ok = await result.current.react(TARGET, "👍");
    expect(ok).toBe(true);
    const [kind, , , parentId, relayUrls] = publishEvent.mock.calls[0];
    expect(kind).toBe(NostrEventKind.Reaction);
    expect(parentId).toBeUndefined();
    expect(relayUrls).toEqual(EXPECTED_URLS);
  });

  it("defers to selected relays (undefined override) when the post's relays are unknown", async () => {
    const { result } = renderHook(() => useReactions());
    await result.current.react({ ...TARGET, relayIds: [] }, "👍");
    const [, , , , relayUrls] = publishEvent.mock.calls[0];
    expect(relayUrls).toBeUndefined();
  });

  it("toasts on publish failure", async () => {
    publishEvent.mockResolvedValue({ success: false, rejectionReason: "blocked" });
    const { result } = renderHook(() => useReactions());
    const ok = await result.current.react(TARGET, "👍");
    expect(ok).toBe(false);
    expect(notify.notifyReactionFailed).toHaveBeenCalledWith("blocked");
  });

  it("prompts sign-in and skips publishing when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useReactions());
    const ok = await result.current.react(TARGET, "👍");
    expect(ok).toBe(false);
    expect(notify.notifyNeedSigninReact).toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });
});

describe("useReactions.unreact", () => {
  const mineReaction = { id: "r-mine", pubkey: "viewer-pk", kind: NostrEventKind.Reaction, tags: [["e", "post-1"]], content: "👍" };

  it("deletes my reaction on the post's resolved relays", async () => {
    bootstrapReactions([mineReaction], "viewer-pk");
    const { result } = renderHook(() => useReactions());
    const ok = await result.current.unreact("post-1", "👍", POST_RELAY_IDS);
    expect(ok).toBe(true);
    const [kind, , tags, , relayUrls] = publishEvent.mock.calls[0];
    expect(kind).toBe(NostrEventKind.EventDeletion);
    expect(tags.some((t: string[]) => t[0] === "e" && t[1] === "r-mine")).toBe(true);
    expect(relayUrls).toEqual(EXPECTED_URLS);
  });

  it("toasts on deletion failure", async () => {
    bootstrapReactions([mineReaction], "viewer-pk");
    publishEvent.mockResolvedValue({ success: false });
    const { result } = renderHook(() => useReactions());
    const ok = await result.current.unreact("post-1", "👍", POST_RELAY_IDS);
    expect(ok).toBe(false);
    expect(notify.notifyReactionRemoveFailed).toHaveBeenCalled();
  });

  it("no-ops when there is no matching reaction of mine", async () => {
    const { result } = renderHook(() => useReactions());
    const ok = await result.current.unreact("post-1", "👍", POST_RELAY_IDS);
    expect(ok).toBe(false);
    expect(publishEvent).not.toHaveBeenCalled();
  });
});
