import { NDKRelayStatus as NativeNDKRelayStatus } from "@nostr-dev-kit/ndk";
import { describe, expect, it } from "vitest";
import { mapNativeRelayStatus, resolveRelayLifecycleStatus } from "./relay-status";

describe("mapNativeRelayStatus", () => {
  it("keeps auth challenge states connected to avoid false connecting regressions", () => {
    expect(mapNativeRelayStatus(NativeNDKRelayStatus.AUTH_REQUESTED)).toBe("connected");
    expect(mapNativeRelayStatus(NativeNDKRelayStatus.AUTHENTICATING)).toBe("connected");
  });

  it("maps active transport states to connecting", () => {
    expect(mapNativeRelayStatus(NativeNDKRelayStatus.CONNECTING)).toBe("connecting");
    expect(mapNativeRelayStatus(NativeNDKRelayStatus.RECONNECTING)).toBe("connecting");
    expect(mapNativeRelayStatus(NativeNDKRelayStatus.FLAPPING)).toBe("connecting");
  });
});

describe("resolveRelayLifecycleStatus", () => {
  it("keeps never-connected relays in connecting during startup disconnect churn", () => {
    expect(resolveRelayLifecycleStatus({
      mappedStatus: "disconnected",
      previousStatus: "connecting",
      hasConnectedOnce: false,
      isAutoPaused: false,
    })).toBe("connecting");
  });

  it("surfaces disconnected after a relay has connected at least once", () => {
    expect(resolveRelayLifecycleStatus({
      mappedStatus: "disconnected",
      previousStatus: "connected",
      hasConnectedOnce: true,
      isAutoPaused: false,
    })).toBe("disconnected");
  });

  it("prioritizes auto-paused failures over transient connecting state", () => {
    expect(resolveRelayLifecycleStatus({
      mappedStatus: "disconnected",
      previousStatus: "connecting",
      hasConnectedOnce: false,
      isAutoPaused: true,
    })).toBe("connection-error");
  });
});
