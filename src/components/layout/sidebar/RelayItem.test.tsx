import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelayItem } from "./RelayItem";
import type { Relay } from "@/types";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

const baseRelay: Relay = {
  id: "relay-1",
  name: "Main Relay",
  icon: "cpu",
  isActive: true,
  url: "wss://relay.damus.io",
};

describe("RelayItem", () => {
  it("supports exclusive and toggle relay actions", () => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
      outcome: { status: "handled" },
    });

    render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <RelayItem relay={baseRelay} />
      </FeedInteractionProvider>
    );

    const exclusiveButton = screen.getByRole("button", { name: "Show only damus space" });
    const toggleButton = screen.getByRole("button", { name: "Toggle damus space" });

    fireEvent.click(exclusiveButton);
    fireEvent.click(toggleButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.exclusive", relayId: "relay-1" });
    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.toggle", relayId: "relay-1" });
  });
});
