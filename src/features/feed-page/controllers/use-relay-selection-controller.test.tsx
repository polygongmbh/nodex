import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relay } from "@/types";
import { useRelaySelectionController } from "./use-relay-selection-controller";
import { toast } from "sonner";
import type { RenderHookResult } from "@testing-library/react";

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
    icon: "radio",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.one",
    ...overrides,
  };
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
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps a relay selected after reconnect recovers", () => {
    const { result, rerender } = renderSelectionController([buildRelay()]);

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
    const { result } = renderSelectionController([buildRelay()]);

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
    const { result, rerender } = renderSelectionController([buildRelay()], 500);

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

  it("triggers manual reconnect when a read-only relay is activated while keeping it selected", () => {
    const { result } = renderSelectionController([buildRelay({ connectionStatus: "read-only" })]);

    expectExclusiveSelectReconnect(result);

    expect(toast.info).toHaveBeenCalled();
    expectActiveRelayIds(result, ["relay-one"]);
  });
});
