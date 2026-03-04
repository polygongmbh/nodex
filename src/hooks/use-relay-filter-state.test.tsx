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
];

function Harness({ onRelayEnabled }: { onRelayEnabled?: (relay: Relay) => void }) {
  const { handleRelayToggle } = useRelayFilterState({
    relays,
    t: ((key: string) => key) as unknown as TFunction,
    defaultRelayIds: [],
    onRelayEnabled,
  });

  return (
    <button onClick={() => handleRelayToggle("relay-one")}>
      Toggle
    </button>
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
});
