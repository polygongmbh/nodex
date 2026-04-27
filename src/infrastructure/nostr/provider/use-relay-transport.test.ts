import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useRelayTransport } from "./use-relay-transport";
import type { RelayTransportRefs } from "./use-relay-transport";

function buildRefs(): RelayTransportRefs {
  return {
    removedRelaysRef: { current: new Set() },
    relayInitialFailureCountsRef: { current: new Map() },
    relayConnectedOnceRef: { current: new Set() },
    relayVerificationReadOpsRef: { current: 0 },
    relayVerificationWriteOpsRef: { current: 0 },
    relayAttemptStartedAtRef: { current: new Map() },
    relayCurrentInstanceRef: { current: new Map() },
    relayReadRejectedRef: { current: new Map() },
    relayWriteRejectedRef: { current: new Map() },
    pendingRelayVerificationRef: { current: new Map() },
    relayAuthRetryHistoryRef: { current: new Map() },
  };
}

describe("useRelayTransport - resetRelayTransportTracking", () => {
  it("clears write-rejected state so a reconnecting relay is not stuck as read-only", () => {
    const refs = buildRefs();
    const relayUrl = "wss://relay.example.com";

    refs.relayWriteRejectedRef.current.set(relayUrl, true);
    refs.relayReadRejectedRef.current.set(relayUrl, true);

    const { result } = renderHook(() =>
      useRelayTransport(
        refs,
        { current: null },
        vi.fn(),
        { current: new Map() }
      )
    );

    result.current.resetRelayTransportTracking(relayUrl);

    expect(refs.relayWriteRejectedRef.current.has(relayUrl)).toBe(false);
    expect(refs.relayReadRejectedRef.current.has(relayUrl)).toBe(false);
  });

  it("only clears the reconnecting relay, leaving others intact", () => {
    const refs = buildRefs();
    const relayUrl = "wss://relay.example.com";
    const otherUrl = "wss://other.example.com";

    refs.relayWriteRejectedRef.current.set(relayUrl, true);
    refs.relayWriteRejectedRef.current.set(otherUrl, true);

    const { result } = renderHook(() =>
      useRelayTransport(
        refs,
        { current: null },
        vi.fn(),
        { current: new Map() }
      )
    );

    result.current.resetRelayTransportTracking(relayUrl);

    expect(refs.relayWriteRejectedRef.current.has(relayUrl)).toBe(false);
    expect(refs.relayWriteRejectedRef.current.has(otherUrl)).toBe(true);
  });
});
