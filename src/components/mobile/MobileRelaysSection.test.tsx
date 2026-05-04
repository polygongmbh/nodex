import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileRelaysSection } from "./MobileRelaysSection";
import type { Relay } from "@/types";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";

const dispatchFeedInteraction = vi.fn(async (intent: FeedInteractionIntent) => ({
  envelope: { id: 1, dispatchedAtMs: Date.now(), intent },
  outcome: { status: "handled" as const },
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const relays: Relay[] = [
  { id: "demo", name: "Demo", isActive: true, url: "wss://demo.test" },
  { id: "custom", name: "Custom", isActive: false, url: "wss://custom.relay" },
];

describe("MobileRelaysSection", () => {
  beforeEach(() => {
    dispatchFeedInteraction.mockClear();
  });

  it("adds a relay when the add button is clicked", () => {
    render(<MobileRelaysSection relays={relays} />);

    fireEvent.change(screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i), {
      target: { value: "wss://relay.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add space/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.add",
      url: "wss://relay.example.com",
    });
  });

  it("adds a relay when Enter is pressed in the input", () => {
    render(<MobileRelaysSection relays={relays} />);

    const input = screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i);
    fireEvent.change(input, { target: { value: "relay.example.com" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.add",
      url: "relay.example.com",
    });
  });

  it("removes a non-demo relay", () => {
    render(<MobileRelaysSection relays={relays} />);

    fireEvent.click(screen.getByRole("button", { name: /remove space custom/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.remove",
      url: "wss://custom.relay",
    });
  });

  it("dispatches typed relay selection intents", () => {
    render(<MobileRelaysSection relays={relays} />);

    fireEvent.click(screen.getByRole("button", { name: /^custom$/i }));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.select",
      relayId: "custom",
      mode: "toggle",
    });
  });
});
