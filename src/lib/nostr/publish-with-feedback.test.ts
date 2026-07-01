import { describe, expect, it, vi, beforeEach } from "vitest";
import { publishWithFeedback, broadcastWithFeedback } from "./publish-with-feedback";
import { NostrEventKind } from "@/lib/nostr/types";
import type { SignedNostrEvent } from "@/infrastructure/nostr/provider/use-publish";

const notifyIfPartialPublish = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notifyIfPartialPublish: (...args: unknown[]) => notifyIfPartialPublish(...args),
}));

beforeEach(() => {
  notifyIfPartialPublish.mockClear();
});

describe("publishWithFeedback", () => {
  it("forwards args to the publisher and returns its result", async () => {
    const publish = vi.fn(async () => ({ success: true, eventId: "e1", targetRelayUrls: ["wss://a"], publishedRelayUrls: ["wss://a"] }));
    const result = await publishWithFeedback(
      publish,
      { kind: NostrEventKind.Reaction, content: "👍", tags: [["e", "abc"]], relayUrls: ["wss://a"] },
      "[test]",
    );
    expect(publish).toHaveBeenCalledWith(NostrEventKind.Reaction, "👍", [["e", "abc"]], undefined, ["wss://a"]);
    expect(result.success).toBe(true);
  });

  it("fires the partial-publish toast only when published is a strict subset of the resolved target", async () => {
    const partial = vi.fn(async () => ({ success: true, eventId: "e1", targetRelayUrls: ["wss://a", "wss://b"], publishedRelayUrls: ["wss://a"] }));
    await publishWithFeedback(partial, { kind: NostrEventKind.TextNote, content: "hi" }, "[test]");
    expect(notifyIfPartialPublish).toHaveBeenCalledWith(["wss://a", "wss://b"], ["wss://a"]);

    notifyIfPartialPublish.mockClear();
    const full = vi.fn(async () => ({ success: true, eventId: "e1", targetRelayUrls: ["wss://a"], publishedRelayUrls: ["wss://a"] }));
    await publishWithFeedback(full, { kind: NostrEventKind.TextNote, content: "hi" }, "[test]");
    // Called, but the helper itself no-ops for a full publish — assert it was handed matching sets.
    expect(notifyIfPartialPublish).toHaveBeenCalledWith(["wss://a"], ["wss://a"]);
  });

  it("passes a failure result through without a partial toast", async () => {
    const publish = vi.fn(async () => ({ success: false, rejectionReason: "blocked" }));
    const result = await publishWithFeedback(publish, { kind: NostrEventKind.TextNote, content: "hi" }, "[test]");
    expect(result.success).toBe(false);
    expect(result.rejectionReason).toBe("blocked");
    expect(notifyIfPartialPublish).not.toHaveBeenCalled();
  });

  it("resolves to a failure result when the publisher throws (no escape)", async () => {
    const publish = vi.fn(async () => { throw new Error("boom"); });
    const result = await publishWithFeedback(publish, { kind: NostrEventKind.TextNote, content: "hi" }, "[test]");
    expect(result).toEqual({ success: false });
    expect(notifyIfPartialPublish).not.toHaveBeenCalled();
  });
});

describe("broadcastWithFeedback", () => {
  it("broadcasts the signed event and detects partial publishes the same way", async () => {
    const signed = { id: "s1" } as unknown as SignedNostrEvent;
    const broadcast = vi.fn(async () => ({ success: true, eventId: "s1", targetRelayUrls: ["wss://a", "wss://b"], publishedRelayUrls: ["wss://b"] }));
    const result = await broadcastWithFeedback(broadcast, signed, ["wss://a", "wss://b"], "[test]");
    expect(broadcast).toHaveBeenCalledWith(signed, ["wss://a", "wss://b"]);
    expect(result.success).toBe(true);
    expect(notifyIfPartialPublish).toHaveBeenCalledWith(["wss://a", "wss://b"], ["wss://b"]);
  });

  it("resolves to a failure result when the broadcaster throws", async () => {
    const signed = { id: "s1" } as unknown as SignedNostrEvent;
    const broadcast = vi.fn(async () => { throw new Error("boom"); });
    const result = await broadcastWithFeedback(broadcast, signed, ["wss://a"], "[test]");
    expect(result).toEqual({ success: false });
  });
});
