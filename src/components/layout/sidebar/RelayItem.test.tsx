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

    const exclusiveButton = screen.getByRole("button", { name: "Show only posts from relay.damus.io" });
    const toggleButton = screen.getByRole("button", { name: "Show or hide posts from relay.damus.io" });

    fireEvent.click(exclusiveButton);
    fireEvent.click(toggleButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.exclusive", relayId: "relay-1" });
    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.relay.toggle", relayId: "relay-1" });
  });

  it("keeps the status dot visible while allowing long names to truncate", () => {
    render(
      <FeedInteractionProvider bus={{ dispatch: vi.fn().mockResolvedValue(undefined), dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <RelayItem
          relay={{
            ...baseRelay,
            name: "very-long-space-name-that-should-not-push-the-status-indicator-out-of-view.example",
            url: undefined,
          }}
        />
      </FeedInteractionProvider>
    );

    const exclusiveButton = screen.getByRole("button", {
      name: /show only posts from very-long-space-name-that-should-not-push-the-status-indicator-out-of-view\.example/i,
    });
    const relayLabel = screen.getByText(
      "very-long-space-name-that-should-not-push-the-status-indicator-out-of-view.example"
    );
    const statusDot = screen.getByLabelText("connected");

    expect(exclusiveButton.className).toContain("min-w-0");
    expect(relayLabel.className).toContain("truncate");
    expect(statusDot.className).toContain("flex-shrink-0");
  });

  it("tints the active relay icon by relay status instead of always using the primary color", () => {
    render(
      <FeedInteractionProvider bus={{ dispatch: vi.fn().mockResolvedValue(undefined), dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <RelayItem
          relay={{
            ...baseRelay,
            connectionStatus: "verification-failed",
          }}
        />
      </FeedInteractionProvider>
    );

    const toggleButton = screen.getByRole("button", { name: "Show or hide posts from relay.damus.io" });
    const iconChip = toggleButton.querySelector("div");

    expect(iconChip).not.toBeNull();
    expect(iconChip?.className).toContain("text-destructive");
    expect(iconChip?.className).toContain("bg-destructive/15");
    expect(iconChip?.className).not.toContain("text-primary");
  });
});
