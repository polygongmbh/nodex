import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProfileSync } from "./use-profile-sync";
import {
  loadCachedKind0Events,
  saveCachedKind0Events,
} from "@/infrastructure/nostr/people-from-kind0";
import { NostrEventKind } from "@/lib/nostr/types";
import type { NDKRelayStatus } from "./contracts";

const PUBKEY = "a".repeat(64);

function makeHarness(
  relays: NDKRelayStatus[],
  publishResult: { success: boolean; eventId?: string; publishedRelayUrls?: string[] },
  initialUserProfile?: Record<string, string>,
) {
  const publishEvent = vi.fn(async () => publishResult);
  const setUser = vi.fn();
  const setNeedsProfileSetup = vi.fn();
  const setIsProfileSyncing = vi.fn();
  const beginRelayOperation = vi.fn();
  const endRelayOperation = vi.fn();

  const user = initialUserProfile
    ? { pubkey: PUBKEY, profile: initialUserProfile }
    : null;

  const { result } = renderHook(() => {
    const profileSyncRunRef = useRef(0);
    return useProfileSync(
      null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user as any,
      relays,
      publishEvent,
      profileSyncRunRef,
      setUser,
      setNeedsProfileSetup,
      setIsProfileSyncing,
      beginRelayOperation,
      endRelayOperation,
    );
  });

  return { result, publishEvent, setUser, setNeedsProfileSetup };
}

describe("useProfileSync – updateUserProfile", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("publishes to all relays including degraded ones, not just connected", async () => {
    const relays: NDKRelayStatus[] = [
      { url: "wss://relay.one", status: "connecting" },
      { url: "wss://relay.two", status: "connection-error" },
      { url: "wss://relay.three", status: "disconnected" },
    ];
    const { result, publishEvent } = makeHarness(relays, {
      success: true,
      eventId: "ev1",
      publishedRelayUrls: ["wss://relay.one"],
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.updateUserProfile({ name: "alice" });
    });

    expect(success).toBe(true);
    const [[, , , , calledRelayUrls]] = publishEvent.mock.calls;
    expect(calledRelayUrls).toContain("wss://relay.one");
    expect(calledRelayUrls).toContain("wss://relay.two");
    expect(calledRelayUrls).toContain("wss://relay.three");
  });

  it("does not fail outright when no relays are in connected status", async () => {
    // Previously the function returned false immediately when no relay had status "connected".
    const relays: NDKRelayStatus[] = [
      { url: "wss://relay.one", status: "connecting" },
    ];
    const { result } = makeHarness(relays, {
      success: true,
      eventId: "ev1",
      publishedRelayUrls: ["wss://relay.one"],
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.updateUserProfile({ name: "alice" });
    });

    expect(success).toBe(true);
  });

  it("writes updated profile to local cache after successful publish", async () => {
    const relays: NDKRelayStatus[] = [
      { url: "wss://relay.one", status: "connected" },
    ];

    saveCachedKind0Events([
      {
        kind: NostrEventKind.Metadata,
        pubkey: PUBKEY,
        created_at: 1000,
        content: JSON.stringify({
          name: "alice",
          picture: "https://old.example/pic.jpg",
        }),
      },
    ]);

    const { result } = makeHarness(
      relays,
      { success: true, eventId: "ev1", publishedRelayUrls: ["wss://relay.one"] },
      { name: "alice", picture: "https://old.example/pic.jpg" },
    );

    await act(async () => {
      await result.current.updateUserProfile({ name: "alice" }); // picture intentionally omitted
    });

    const cached = loadCachedKind0Events();
    const entry = cached.find((e) => e.pubkey === PUBKEY);
    expect(entry).toBeDefined();
    const content = JSON.parse(entry!.content) as Record<string, unknown>;
    expect(content.name).toBe("alice");
    // Old picture must NOT be backfilled from stale cache
    expect(content.picture).toBeUndefined();
  });

  it("replaces all stale fields in cache with freshly published values", async () => {
    const relays: NDKRelayStatus[] = [
      { url: "wss://relay.one", status: "connected" },
    ];

    saveCachedKind0Events([
      {
        kind: NostrEventKind.Metadata,
        pubkey: PUBKEY,
        created_at: 1000,
        content: JSON.stringify({
          name: "old-alice",
          displayName: "Old Alice",
          about: "Old bio",
          nip05: "old@example.com",
        }),
      },
    ]);

    const { result } = makeHarness(
      relays,
      { success: true, eventId: "ev1", publishedRelayUrls: ["wss://relay.one"] },
      { name: "old-alice", displayName: "Old Alice", about: "Old bio", nip05: "old@example.com" },
    );

    await act(async () => {
      await result.current.updateUserProfile({
        name: "new-alice",
        displayName: "New Alice",
      });
    });

    const cached = loadCachedKind0Events();
    const entry = cached.find((e) => e.pubkey === PUBKEY);
    expect(entry).toBeDefined();
    const content = JSON.parse(entry!.content) as Record<string, unknown>;
    expect(content.name).toBe("new-alice");
    expect(content.displayName).toBe("New Alice");
    // Old stale fields must not survive
    expect(content.about).toBeUndefined();
    expect(content.nip05).toBeUndefined();
  });

  it("does not write to cache when publish fails", async () => {
    const relays: NDKRelayStatus[] = [
      { url: "wss://relay.one", status: "connected" },
    ];

    saveCachedKind0Events([
      {
        kind: NostrEventKind.Metadata,
        pubkey: PUBKEY,
        created_at: 1000,
        content: JSON.stringify({ name: "alice" }),
      },
    ]);

    const { result } = makeHarness(
      relays,
      { success: false },
      { name: "alice" },
    );

    await act(async () => {
      await result.current.updateUserProfile({ name: "new-name" });
    });

    const cached = loadCachedKind0Events();
    const entry = cached.find((e) => e.pubkey === PUBKEY);
    const content = JSON.parse(entry!.content) as Record<string, unknown>;
    expect(content.name).toBe("alice"); // unchanged
  });
});
