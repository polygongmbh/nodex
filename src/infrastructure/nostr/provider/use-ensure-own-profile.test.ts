import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEnsureOwnProfile } from "./use-ensure-own-profile";
import { NostrEventKind } from "@/lib/nostr/types";
import type { AuthMethod, NDKContextValue, NDKRelayStatus } from "./contracts";

const PUBKEY = "a".repeat(64);

type PublishEvent = NDKContextValue["publishEvent"];

function makeHarness(opts?: {
  relays?: NDKRelayStatus[];
  profile?: Record<string, string> | null;
  existingKind0?: Record<string, string> | null;
  authMethod?: AuthMethod;
}) {
  const publishEvent = vi.fn<PublishEvent>(async () => ({
    success: true,
    eventId: "ev1",
    publishedRelayUrls: [],
  }));
  const fetchCurrentUserKind0Profile = vi.fn(async () => opts?.existingKind0 ?? null);

  const initialProps = {
    user: opts?.profile === null ? null : ({ pubkey: PUBKEY, profile: opts?.profile } as never),
    authMethod: opts?.authMethod ?? ("noas" as AuthMethod),
    relays: opts?.relays ?? ([{ url: "wss://relay.one", status: "connected" }] as NDKRelayStatus[]),
  };

  const { rerender } = renderHook(
    ({ user, authMethod, relays }) =>
      useEnsureOwnProfile(user, authMethod, relays, publishEvent, fetchCurrentUserKind0Profile),
    { initialProps },
  );

  return { publishEvent, fetchCurrentUserKind0Profile, rerender };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("useEnsureOwnProfile", () => {
  it("publishes the local profile as kind 0 when the relays hold none", async () => {
    const { publishEvent } = makeHarness({ profile: { name: "alice", picture: "https://img" } });
    await flush();

    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(publishEvent.mock.calls[0][0]).toBe(NostrEventKind.Metadata);
    const content = JSON.parse(publishEvent.mock.calls[0][1] as string) as Record<string, string>;
    expect(content.name).toBe("alice");
    expect(content.picture).toBe("https://img");
  });

  it("does not publish when the relays already have an own kind 0", async () => {
    const { publishEvent } = makeHarness({
      profile: { name: "alice" },
      existingKind0: { name: "alice-established" },
    });
    await flush();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("does not publish without a writable relay connection", async () => {
    const { publishEvent, fetchCurrentUserKind0Profile } = makeHarness({
      profile: { name: "alice" },
      relays: [{ url: "wss://relay.one", status: "connecting" }],
    });
    await flush();
    expect(fetchCurrentUserKind0Profile).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("does not publish when there is no publishable local profile", async () => {
    const { publishEvent } = makeHarness({ profile: {} });
    await flush();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("does not publish for a guest's throwaway identity", async () => {
    const { publishEvent, fetchCurrentUserKind0Profile } = makeHarness({
      profile: { name: "anon-guest" },
      authMethod: "guest",
    });
    await flush();
    expect(fetchCurrentUserKind0Profile).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("publishes once and not again when relays are unchanged across re-renders", async () => {
    const relays: NDKRelayStatus[] = [{ url: "wss://relay.one", status: "connected" }];
    const { publishEvent, rerender } = makeHarness({ profile: { name: "alice" }, relays });
    await flush();
    expect(publishEvent).toHaveBeenCalledTimes(1);

    // A re-render with the same writable relay set must not re-publish.
    rerender({
      user: { pubkey: PUBKEY, profile: { name: "alice" } } as never,
      authMethod: "noas",
      relays: [...relays],
    });
    await flush();
    expect(publishEvent).toHaveBeenCalledTimes(1);
  });

  it("retries on the next relay change after a failed publish (failure is not recorded)", async () => {
    const publishEvent = vi.fn<PublishEvent>()
      .mockResolvedValueOnce({ success: false, rejectionReason: "auth-required" })
      .mockResolvedValueOnce({ success: true, eventId: "ev1", publishedRelayUrls: [] });
    const fetchCurrentUserKind0Profile = vi.fn(async () => null);

    const relays: NDKRelayStatus[] = [{ url: "wss://relay.one", status: "connected" }];
    const { rerender } = renderHook(
      ({ user, authMethod, relays }) =>
        useEnsureOwnProfile(user, authMethod, relays, publishEvent, fetchCurrentUserKind0Profile),
      {
        initialProps: {
          user: { pubkey: PUBKEY, profile: { name: "alice" } } as never,
          authMethod: "noas" as AuthMethod,
          relays,
        },
      },
    );

    await flush();
    expect(publishEvent).toHaveBeenCalledTimes(1);

    // A subsequent relay status change must re-attempt — the failure was not recorded.
    rerender({
      user: { pubkey: PUBKEY, profile: { name: "alice" } } as never,
      authMethod: "noas",
      relays: [{ url: "wss://relay.one", status: "connected" }],
    });
    await flush();
    expect(publishEvent).toHaveBeenCalledTimes(2);
  });
});
