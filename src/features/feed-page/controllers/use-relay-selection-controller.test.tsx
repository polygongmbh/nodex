import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relay } from "@/types";
import { useRelaySelectionController } from "./use-relay-selection-controller";
import { toast } from "sonner";
import type { RenderHookResult } from "@testing-library/react";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";

const { mockedToast } = vi.hoisted(() => ({
  mockedToast: Object.assign(vi.fn(), {
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: mockedToast,
}));

function buildRelay(overrides: Partial<Relay> = {}): Relay {
  return {
    id: "relay-one",
    name: "Relay One",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.one",
    ...overrides,
  };
}

function buildReadOnlyRelay(overrides: Partial<Relay> = {}): Relay {
  return buildRelay({ connectionStatus: "read-only", ...overrides });
}

function buildVerificationFailedRelay(overrides: Partial<Relay> = {}): Relay {
  return buildRelay({ connectionStatus: "verification-failed", ...overrides });
}

function buildConnectingRelay(overrides: Partial<Relay> = {}): Relay {
  return buildRelay({ connectionStatus: "connecting", ...overrides });
}

function renderSelectionController(relays: Relay[], reconnectFailureGraceMs = 50) {
  return renderHook(
    ({ currentRelays }) => useRelaySelectionController({
      relays: currentRelays,
      reconnectFailureGraceMs,
    }),
    {
      initialProps: {
        currentRelays: relays,
      },
    }
  );
}

function expectExclusiveSelectReconnect(
  result: RenderHookResult<
    ReturnType<typeof useRelaySelectionController>,
    { currentRelays: Relay[] }
  >["result"],
  expectedRelayUrl = "wss://relay.one"
) {
  act(() => {
    expect(result.current.handleRelaySelectIntent("relay-one", "exclusive")).toBe(expectedRelayUrl);
  });
}

function expectActiveRelayIds(
  result: RenderHookResult<
    ReturnType<typeof useRelaySelectionController>,
    { currentRelays: Relay[] }
  >["result"],
  expectedRelayIds: string[]
) {
  expect(Array.from(result.current.effectiveActiveRelayIds)).toEqual(expectedRelayIds);
}

describe("useRelaySelectionController", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useFilterStore.setState({ activeRelayIds: new Set(), channelFilterStates: new Map(), channelMatchMode: "and" });
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps a relay selected after reconnect recovers", () => {
    const { result, rerender } = renderSelectionController([buildVerificationFailedRelay()]);

    expectExclusiveSelectReconnect(result);

    expect(toast.info).toHaveBeenCalled();
    expectActiveRelayIds(result, ["relay-one"]);

    act(() => {
      rerender({
        currentRelays: [buildRelay({ connectionStatus: "connecting" })],
      });
    });

    act(() => {
      rerender({
        currentRelays: [buildRelay({ connectionStatus: "connected" })],
      });
    });

    expectActiveRelayIds(result, ["relay-one"]);
  });

  it("deselects a failed relay again when reconnect never recovers", () => {
    vi.useFakeTimers();
    const { result } = renderSelectionController([buildVerificationFailedRelay()]);

    expectExclusiveSelectReconnect(result);

    expectActiveRelayIds(result, ["relay-one"]);
    expect(toast.info).toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expectActiveRelayIds(result, []);
    expect(toast.error).toHaveBeenCalled();
  });

  it("deselects a relay when it returns to a failed state after connecting", () => {
    const { result, rerender } = renderSelectionController([buildVerificationFailedRelay()], 500);

    expectExclusiveSelectReconnect(result);

    act(() => {
      rerender({
        currentRelays: [buildRelay({ connectionStatus: "connecting" })],
      });
    });

    expectActiveRelayIds(result, ["relay-one"]);

    act(() => {
      rerender({
        currentRelays: [buildRelay({ connectionStatus: "connection-error" })],
      });
    });

    expectActiveRelayIds(result, []);
    expect(toast.error).toHaveBeenCalled();
  });

  it("uses the normal selection toast when a read-only relay is activated", () => {
    const { result } = renderSelectionController([buildReadOnlyRelay()]);

    expectExclusiveSelectReconnect(result);

    expect(toast).toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expectActiveRelayIds(result, ["relay-one"]);
  });

  it("tries to reconnect and deselects disconnected relays when selection does not recover", () => {
    vi.useFakeTimers();
    const { result } = renderSelectionController([buildRelay({ connectionStatus: "disconnected" })]);

    expectExclusiveSelectReconnect(result);

    expect(toast.info).toHaveBeenCalled();
    expectActiveRelayIds(result, ["relay-one"]);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expectActiveRelayIds(result, []);
    expect(toast.error).toHaveBeenCalled();
  });

  it("tries to reconnect and deselects connection-error relays when selection does not recover", () => {
    vi.useFakeTimers();
    const { result } = renderSelectionController([buildRelay({ connectionStatus: "connection-error" })]);

    expectExclusiveSelectReconnect(result);

    expect(toast.info).toHaveBeenCalled();
    expectActiveRelayIds(result, ["relay-one"]);

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expectActiveRelayIds(result, []);
    expect(toast.error).toHaveBeenCalled();
  });

  it("tries to reconnect connecting relays and deselects when they fail", () => {
    const { result, rerender } = renderSelectionController([buildConnectingRelay()], 500);

    expectExclusiveSelectReconnect(result);

    expect(toast.info).toHaveBeenCalled();
    expectActiveRelayIds(result, ["relay-one"]);

    act(() => {
      rerender({
        currentRelays: [buildRelay({ connectionStatus: "connection-error" })],
      });
    });

    expectActiveRelayIds(result, []);
    expect(toast.error).toHaveBeenCalled();
  });
});
