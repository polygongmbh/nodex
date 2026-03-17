import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Relay } from "@/types";
import type { TFunction } from "i18next";
import { useRelayFilterState } from "./use-relay-filter-state";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

const relays: Relay[] = [
  {
    id: "relay-one",
    name: "Relay One",
    icon: "radio",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.one",
  },
  {
    id: "relay-two",
    name: "Relay Two",
    icon: "radio",
    isActive: false,
    connectionStatus: "disconnected",
    url: "wss://relay.two",
  },
];

function Harness({ onRelayEnabled }: { onRelayEnabled?: (relay: Relay) => void }) {
  const { handleRelayToggle, handleRelayExclusive, handleToggleAllRelays, effectiveActiveRelayIds } = useRelayFilterState({
    relays,
    t: ((key: string) => key) as unknown as TFunction,
    defaultRelayIds: [],
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

    render(<Harness onRelayEnabled={onRelayEnabled} />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    fireEvent.click(screen.getByRole("button", { name: "ToggleAll" }));

    expect(onRelayEnabled).toHaveBeenCalledTimes(1);
    expect(onRelayEnabled).toHaveBeenCalledWith(relays[0]);
  });

  it("auto-selects available relays when persisted ids do not match discovered relays", () => {
    window.localStorage.setItem("nodex.active-relays.v1", JSON.stringify(["stale-relay-id"]));

    render(<Harness />);

    expect(screen.getByTestId("active-relay-ids").textContent).toBe("relay-one,relay-two");
  });
});
