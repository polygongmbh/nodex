import { describe, expect, it, vi } from "vitest";
import type NDK from "@nostr-dev-kit/ndk";
import { fetchCurrentUserKind0Profile, type CurrentUserKind0FetchHelpers } from "./current-user-kind0";

const PUBKEY = "a".repeat(64);

function makeSubscription() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on(event: string, cb: (...args: unknown[]) => void) {
      handlers[event] = cb;
    },
    stop: vi.fn(),
    emit(event: string, ...args: unknown[]) {
      handlers[event]?.(...args);
    },
  };
}

function makeHarness() {
  const subscription = makeSubscription();
  const subscribe = vi.fn(() => subscription);
  const ndk = { subscribe } as unknown as NDK;

  let scheduledCallback: (() => void) | null = null;
  const helpers: CurrentUserKind0FetchHelpers = {
    beginRelayOperation: vi.fn(),
    endRelayOperation: vi.fn(),
    scheduleRelayTimeout: vi.fn((cb: () => void) => {
      scheduledCallback = cb;
      return 1;
    }),
    clearTrackedRelayTimeout: vi.fn(),
  };

  return { ndk, subscribe, subscription, helpers, fireTimeout: () => scheduledCallback?.() };
}

describe("fetchCurrentUserKind0Profile", () => {
  it("returns null without subscribing when ndk or pubkey is missing", async () => {
    const { helpers, subscribe } = makeHarness();
    expect(await fetchCurrentUserKind0Profile(null, PUBKEY, helpers)).toBeNull();
    expect(await fetchCurrentUserKind0Profile({ subscribe } as unknown as NDK, "  ", helpers)).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("resolves the newest kind 0 by created_at on eose, tracking the read op", async () => {
    const { ndk, subscription, helpers } = makeHarness();

    const promise = fetchCurrentUserKind0Profile(ndk, PUBKEY, helpers);
    subscription.emit("event", { created_at: 100, content: JSON.stringify({ name: "old" }) });
    subscription.emit("event", { created_at: 200, content: JSON.stringify({ name: "new" }) });
    subscription.emit("eose");

    const profile = await promise;
    expect(profile?.name).toBe("new");
    expect(helpers.beginRelayOperation).toHaveBeenCalledWith("read");
    expect(helpers.endRelayOperation).toHaveBeenCalledWith("read");
    expect(helpers.clearTrackedRelayTimeout).toHaveBeenCalledWith(1);
    expect(subscription.stop).toHaveBeenCalled();
  });

  it("resolves null on an auth-required close without waiting for the fallback", async () => {
    const { ndk, subscription, helpers } = makeHarness();

    const promise = fetchCurrentUserKind0Profile(ndk, PUBKEY, helpers);
    subscription.emit("closed", {}, "auth-required: pubkey not in whitelist");

    expect(await promise).toBeNull();
    expect(helpers.endRelayOperation).toHaveBeenCalledWith("read");
  });

  it("resolves null when the fallback timeout fires before any event", async () => {
    const { ndk, helpers, fireTimeout } = makeHarness();

    const promise = fetchCurrentUserKind0Profile(ndk, PUBKEY, helpers);
    fireTimeout();

    expect(await promise).toBeNull();
  });
});
