import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Relay } from "@/types";
import { useRelayAutoReconnect } from "./use-relay-auto-reconnect";

interface HarnessProps {
  relays: Relay[];
  activeRelayIds: Set<string>;
  reconnectRelay: (url: string) => void;
  retryBaseMs?: number;
  retryMultiplier?: number;
  retryMaxMs?: number;
  retryTickMs?: number;
}

function Harness(props: HarnessProps): null {
  useRelayAutoReconnect(props);
  return null;
}

function buildRelay(overrides: Partial<Relay> & Pick<Relay, "id">): Relay {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    icon: overrides.icon ?? "radio",
    isActive: overrides.isActive ?? false,
    connectionStatus: overrides.connectionStatus ?? "connected",
    url: overrides.url,
  };
}

describe("useRelayAutoReconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries all failed relays when every eligible relay is failed", () => {
    const reconnectRelay = vi.fn();
    const relays = [
      buildRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connection-error" }),
      buildRelay({ id: "relay-two", url: "wss://relay.two", connectionStatus: "verification-failed" }),
    ];

    render(
      <Harness
        relays={relays}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(reconnectRelay).toHaveBeenCalledTimes(2);
    expect(reconnectRelay).toHaveBeenCalledWith("wss://relay.one", { forceNewSocket: false });
    expect(reconnectRelay).toHaveBeenCalledWith("wss://relay.two", { forceNewSocket: false });
  });

  it("retries only failed selected relays when some relays are healthy", () => {
    const reconnectRelay = vi.fn();
    const relays = [
      buildRelay({ id: "relay-selected-failed", url: "wss://relay.one", connectionStatus: "connection-error" }),
      buildRelay({ id: "relay-unselected-failed", url: "wss://relay.two", connectionStatus: "disconnected" }),
      buildRelay({ id: "relay-selected-healthy", url: "wss://relay.three", connectionStatus: "connected" }),
    ];

    render(
      <Harness
        relays={relays}
        activeRelayIds={new Set(["relay-selected-failed", "relay-selected-healthy"])}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(reconnectRelay).toHaveBeenCalledTimes(1);
    expect(reconnectRelay).toHaveBeenCalledWith("wss://relay.one", { forceNewSocket: false });
  });

  it("uses progressive cooldown backoff", () => {
    const reconnectRelay = vi.fn();
    const relays = [buildRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connection-error" })];

    render(
      <Harness
        relays={relays}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
        retryMultiplier={2}
        retryMaxMs={1_000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(3);
  });

  it("caps cooldown duration while keeping retries unlimited", () => {
    const reconnectRelay = vi.fn();
    const relays = [buildRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connection-error" })];

    render(
      <Harness
        relays={relays}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
        retryMultiplier={2}
        retryMaxMs={40}
      />
    );

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(4);

    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(4);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(5);

    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(5);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(6);
  });

  it("resets cooldown and retries immediately when tab regains focus", () => {
    const reconnectRelay = vi.fn();
    const relays = [buildRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connection-error" })];

    render(
      <Harness
        relays={relays}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={100}
        retryTickMs={100}
        retryMultiplier={2}
        retryMaxMs={1_000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(50);
      window.dispatchEvent(new Event("focus"));
    });

    expect(reconnectRelay).toHaveBeenCalledTimes(2);
  });

  it("clears backoff after a relay becomes healthy", () => {
    const reconnectRelay = vi.fn();
    const relayFailed = [buildRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connection-error" })];
    const relayHealthy = [buildRelay({ id: "relay-one", url: "wss://relay.one", connectionStatus: "connected" })];

    const view = render(
      <Harness
        relays={relayFailed}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
        retryMultiplier={2}
        retryMaxMs={1_000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(1);

    view.rerender(
      <Harness
        relays={relayHealthy}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
        retryMultiplier={2}
        retryMaxMs={1_000}
      />
    );

    view.rerender(
      <Harness
        relays={relayFailed}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
        retryMultiplier={2}
        retryMaxMs={1_000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(reconnectRelay).toHaveBeenCalledTimes(3);
  });

  it("ignores demo failed relays when selecting reconnect targets", () => {
    const reconnectRelay = vi.fn();
    const relays = [
      buildRelay({ id: "demo", url: "wss://demo.local", connectionStatus: "connection-error" }),
      buildRelay({ id: "relay-real", url: "wss://relay.real", connectionStatus: "disconnected" }),
    ];

    render(
      <Harness
        relays={relays}
        activeRelayIds={new Set()}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
      />
    );

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(reconnectRelay).toHaveBeenCalledTimes(1);
    expect(reconnectRelay).toHaveBeenCalledWith("wss://relay.real", { forceNewSocket: false });
  });

  it("does not retry when no trigger condition is met", () => {
    const reconnectRelay = vi.fn();
    const relays = [
      buildRelay({ id: "relay-selected", url: "wss://relay.one", connectionStatus: "connected" }),
      buildRelay({ id: "relay-unselected-failed", url: "wss://relay.two", connectionStatus: "connection-error" }),
    ];

    render(
      <Harness
        relays={relays}
        activeRelayIds={new Set(["relay-selected"])}
        reconnectRelay={reconnectRelay}
        retryBaseMs={10}
        retryTickMs={10}
      />
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(reconnectRelay).not.toHaveBeenCalled();
  });
});
