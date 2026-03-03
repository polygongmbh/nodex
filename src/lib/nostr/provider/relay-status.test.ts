import { NDKRelayStatus as NativeNDKRelayStatus } from "@nostr-dev-kit/ndk";
import { describe, expect, it } from "vitest";
import { mapNativeRelayStatus } from "./relay-status";

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
