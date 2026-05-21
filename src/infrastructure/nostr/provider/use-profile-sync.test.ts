import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useProfileSync } from "./use-profile-sync";
import type { NDKRelayStatus } from "./contracts";

const PUBKEY = "a".repeat(64);

function makeHarness(
  relays: NDKRelayStatus[],
  publishResult: { success: boolean; eventId?: string; publishedRelayUrls?: string[] },
  initialUserProfile?: Record<string, string>,
) {
  const publishEvent = vi.fn(async () => publishResult);
  const fetchLatestKind0Profile = vi.fn(async () => null);
  const setUser = vi.fn();
  const setNeedsProfileSetup = vi.fn();
  const setIsProfileSyncing = vi.fn();

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
      fetchLatestKind0Profile,
      profileSyncRunRef,
      setUser,
      setNeedsProfileSetup,
      setIsProfileSyncing,
    );
  });

  return { result, publishEvent, setUser, setNeedsProfileSetup };
}

describe("useProfileSync – updateUserProfile", () => {

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
    const calledRelayUrls = publishEvent.mock.calls[0]?.slice(4, 5)[0] as string[] | undefined;
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

  it("publishes only the fields the user just set, not anything from a stale local profile", async () => {
    const relays: NDKRelayStatus[] = [
      { url: "wss://relay.one", status: "connected" },
    ];

    const { result, publishEvent } = makeHarness(
      relays,
      { success: true, eventId: "ev1", publishedRelayUrls: ["wss://relay.one"] },
      // The in-memory user object has stale extras (picture, about, nip05).
      // The publish call should NOT silently carry them along.
      { name: "old-alice", displayName: "Old Alice", about: "Old bio", picture: "https://old/pic.jpg", nip05: "old@example.com" },
    );

    await act(async () => {
      await result.current.updateUserProfile({ name: "new-alice", displayName: "New Alice" });
    });

    expect(publishEvent).toHaveBeenCalledTimes(1);
    const publishedContent = JSON.parse(publishEvent.mock.calls[0][1] as string) as Record<string, unknown>;
    expect(publishedContent.name).toBe("new-alice");
    expect(publishedContent.displayName).toBe("New Alice");
    expect(publishedContent.about).toBeUndefined();
    expect(publishedContent.picture).toBeUndefined();
    expect(publishedContent.nip05).toBeUndefined();
  });
});
