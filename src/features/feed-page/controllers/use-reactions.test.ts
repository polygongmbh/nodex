import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { NostrEventKind } from "@/lib/nostr/types";
import {
  bootstrapReactions,
  __resetReactionsRegistryForTests,
} from "@/features/feed-page/stores/reactions-registry";

const publishEvent = vi.fn();
let mockUser: { pubkey: string } | null = { pubkey: "viewer-pk" };

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ ndk: {}, user: mockUser, publishEvent }),
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
  __resetReactionsRegistryForTests();
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
