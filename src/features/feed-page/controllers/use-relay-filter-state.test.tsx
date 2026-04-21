import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Relay } from "@/types";
import { toast } from "sonner";
import { useRelayFilterState } from "./use-relay-filter-state";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

const relays: Relay[] = [
  {
    id: "relay-one",
    name: "Relay One",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.one",
  },
  {
    id: "relay-two",
    name: "Relay Two",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.two",
  },
];

const connectedRelays: Relay[] = [
  {
    id: "relay-one",
    name: "Relay One",
    isActive: false,
    connectionStatus: "connected",
    url: "wss://relay.one",
  },
  {
    id: "relay-two",
    name: "Relay Two",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.two",
  },
];

function Harness({
  onRelayEnabled,
  relayList = relays,
}: {
  onRelayEnabled?: (relay: Relay) => void;
  relayList?: Relay[];
}) {
  const { handleRelayToggle, handleRelayExclusive, handleToggleAllRelays, effectiveActiveRelayIds } = useRelayFilterState({
    relays: relayList,
    onRelayEnabled,
  });

  return (
    <>
      <button onClick={() => handleRelayToggle("relay-one")}>
        Toggle
      </button>
      <button onClick={() => handleRelayExclusive("relay-one")}>
        Exclusive
      </button>
      <button onClick={handleToggleAllRelays}>
        ToggleAll
      </button>
      <output data-testid="active-relay-ids">{Array.from(effectiveActiveRelayIds).sort().join(",")}</output>
    </>
  );
}

describe("useRelayFilterState", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("calls onRelayEnabled only when enabling a relay", () => {
    const onRelayEnabled = vi.fn();

    render(<Harness onRelayEnabled={onRelayEnabled} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));

    expect(onRelayEnabled).toHaveBeenCalledTimes(1);
    expect(onRelayEnabled).toHaveBeenCalledWith(relays[0]);
  });

  it("calls onRelayEnabled when selecting a relay exclusively", () => {
    const onRelayEnabled = vi.fn();

    render(<Harness onRelayEnabled={onRelayEnabled} />);

    fireEvent.click(screen.getByRole("button", { name: "Exclusive" }));

    expect(onRelayEnabled).toHaveBeenCalledTimes(1);
    expect(onRelayEnabled).toHaveBeenCalledWith(relays[0]);
  });

  it("clears relay filters when selecting the same exclusive relay twice", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Exclusive" }));
    expect(screen.getByTestId("active-relay-ids").textContent).toBe("relay-one");

    fireEvent.click(screen.getByRole("button", { name: "Exclusive" }));
    expect(screen.getByTestId("active-relay-ids").textContent).toBe("");
  });

  it("calls onRelayEnabled for relays newly selected by select-all", () => {
    const onRelayEnabled = vi.fn();
    // Seed relay-one as active so auto-init is skipped; Toggle will deactivate it.
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["relay-one"]));

    render(<Harness relayList={connectedRelays} onRelayEnabled={onRelayEnabled} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle" })); // removes relay-one
    fireEvent.click(screen.getByRole("button", { name: "ToggleAll" })); // re-activates relay-one (connected)

    expect(onRelayEnabled).toHaveBeenCalledTimes(1);
    expect(onRelayEnabled).toHaveBeenCalledWith(connectedRelays[0]);
  });

  it("preserves an empty selection when no relay ids were persisted", () => {
    render(<Harness />);

    expect(screen.getByTestId("active-relay-ids").textContent).toBe("");
  });

  it("preserves an empty selection when persisted ids do not match discovered relays", () => {
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["stale-relay-id"]));

    render(<Harness />);

    expect(screen.getByTestId("active-relay-ids").textContent).toBe("");
  });

  it("preserves an empty selection when persisted relay payload is invalid", () => {
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify({ invalid: true }));

    render(<Harness />);

    expect(screen.getByTestId("active-relay-ids").textContent).toBe("");
  });

  it("toggle-all selects only connected relays when mix of connected/disconnected", () => {
    // Seed relay-two (disconnected) as active; toggle-all should switch to relay-one (connected) only.
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["relay-two"]));
    render(<Harness relayList={connectedRelays} />);

    fireEvent.click(screen.getByRole("button", { name: "ToggleAll" }));

    expect(screen.getByTestId("active-relay-ids").textContent).toBe("relay-one");
  });

  it("toggle-all clears all when all connected relays are already active", () => {
    // Seed relay-two (disconnected) so auto-init is skipped; relay-one (connected) is not yet active.
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["relay-two"]));
    render(<Harness relayList={connectedRelays} />);

    // First click: activates relay-one (the only connected relay).
    fireEvent.click(screen.getByRole("button", { name: "ToggleAll" }));
    expect(screen.getByTestId("active-relay-ids").textContent).toBe("relay-one");

    // Second click: all connected relays are now active → clears everything.
    fireEvent.click(screen.getByRole("button", { name: "ToggleAll" }));
    expect(screen.getByTestId("active-relay-ids").textContent).toBe("");
  });

  it("toggle-all is a no-op when no relays are connected", () => {
    // Seed relay-two so auto-init is skipped; all relays are disconnected.
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["relay-two"]));
    render(<Harness relayList={relays} />);

    fireEvent.click(screen.getByRole("button", { name: "ToggleAll" }));

    expect(screen.getByTestId("active-relay-ids").textContent).toBe("relay-two");
  });

  it("calls onRelayEnabled only for newly-connected relays activated by toggle-all", () => {
    const onRelayEnabled = vi.fn();
    // Seed relay-two (disconnected) so relay-one (connected) is not yet active.
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["relay-two"]));
    render(<Harness relayList={connectedRelays} onRelayEnabled={onRelayEnabled} />);

    fireEvent.click(screen.getByRole("button", { name: "ToggleAll" }));

    expect(onRelayEnabled).toHaveBeenCalledTimes(1);
    expect(onRelayEnabled).toHaveBeenCalledWith(connectedRelays[0]);
  });

  it("includes relay domain in toast message when selecting exclusively", () => {
    render(<Harness relayList={connectedRelays} />);

    fireEvent.click(screen.getByRole("button", { name: "Exclusive" }));

    expect(toast).toHaveBeenCalledWith(expect.stringContaining("relay.one"));
  });
});
