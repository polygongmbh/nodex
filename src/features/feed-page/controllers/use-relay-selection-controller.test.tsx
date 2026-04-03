import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relay } from "@/types";
import type { TFunction } from "i18next";
import { useRelaySelectionController } from "./use-relay-selection-controller";
import { toast } from "sonner";

const { mockedToast } = vi.hoisted(() => ({
  mockedToast: Object.assign(vi.fn(), {
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: mockedToast,
}));

const t = ((key: string) => key) as unknown as TFunction;

function buildRelay(overrides: Partial<Relay> = {}): Relay {
  return {
    id: "relay-one",
    name: "Relay One",
    icon: "radio",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.one",
    ...overrides,
  };
}

describe("useRelaySelectionController", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps a relay selected after reconnect recovers", () => {
    const reconnectRelay = vi.fn();
    const { result, rerender } = renderHook(
      ({ relays }) => useRelaySelectionController({
        relays,
        t,
        reconnectRelay,
        reconnectFailureGraceMs: 50,
      }),
      {
        initialProps: {
          relays: [buildRelay()],
        },
      }
    );

    act(() => {
      result.current.handleRelaySelectIntent("relay-one", "exclusive");
    });

    expect(reconnectRelay).toHaveBeenCalledWith("wss://relay.one");
    expect(toast.info).toHaveBeenCalledWith("toasts.info.relayReconnectAttempt");
    expect(Array.from(result.current.effectiveActiveRelayIds)).toEqual(["relay-one"]);

    act(() => {
      rerender({
        relays: [buildRelay({ connectionStatus: "connecting" })],
      });
    });

    act(() => {
      rerender({
        relays: [buildRelay({ connectionStatus: "connected" })],
      });
    });

    expect(Array.from(result.current.effectiveActiveRelayIds)).toEqual(["relay-one"]);
  });

  it("deselects a failed relay again when reconnect never recovers", () => {
    vi.useFakeTimers();
    const reconnectRelay = vi.fn();
    const { result } = renderHook(() => useRelaySelectionController({
      relays: [buildRelay()],
      t,
      reconnectRelay,
      reconnectFailureGraceMs: 50,
    }));

    act(() => {
      result.current.handleRelaySelectIntent("relay-one", "exclusive");
    });

    expect(Array.from(result.current.effectiveActiveRelayIds)).toEqual(["relay-one"]);
    expect(toast.info).toHaveBeenCalledWith("toasts.info.relayReconnectAttempt");

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(Array.from(result.current.effectiveActiveRelayIds)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("toasts.errors.relayReconnectFailedDeselected");
  });

  it("deselects a relay when it returns to a failed state after connecting", () => {
    const reconnectRelay = vi.fn();
    const { result, rerender } = renderHook(
      ({ relays }) => useRelaySelectionController({
        relays,
        t,
        reconnectRelay,
        reconnectFailureGraceMs: 500,
      }),
      {
        initialProps: {
          relays: [buildRelay()],
        },
      }
    );

    act(() => {
      result.current.handleRelaySelectIntent("relay-one", "exclusive");
    });

    act(() => {
      rerender({
        relays: [buildRelay({ connectionStatus: "connecting" })],
      });
    });

    expect(Array.from(result.current.effectiveActiveRelayIds)).toEqual(["relay-one"]);

    act(() => {
      rerender({
        relays: [buildRelay({ connectionStatus: "connection-error" })],
      });
    });

    expect(Array.from(result.current.effectiveActiveRelayIds)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("toasts.errors.relayReconnectFailedDeselected");
  });
});
