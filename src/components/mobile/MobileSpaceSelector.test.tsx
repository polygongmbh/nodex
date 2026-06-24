import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileSpaceSelector } from "./MobileSpaceSelector";
import type { Relay } from "@/types";
import type { FeedInteractionIntent } from "@/features/feed-page/interactions/feed-interaction-intent";
import { useFilterStore } from "@/features/feed-page/stores/filter-store";
import { relayUrlToName } from "@/infrastructure/nostr/relay-url";

const dispatchFeedInteraction = vi.fn(async (intent: FeedInteractionIntent) => ({
  envelope: { id: 1, dispatchedAtMs: 0, intent },
  outcome: { status: "handled" as const },
}));

const relays: Relay[] = [
  { id: "demo", name: "Demo", isActive: true, url: "wss://demo.test" },
  { id: "tasks", name: "Tasks", isActive: true, url: "wss://tasks.relay", connectionStatus: "connected" },
  { id: "down", name: "Down", isActive: false, url: "wss://down.relay", connectionStatus: "disconnected" },
];

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

vi.mock("@/features/feed-page/views/feed-surface-context", () => ({
  useFeedSurfaceState: () => ({ relays }),
}));

const tasksName = relayUrlToName("wss://tasks.relay");
const downName = relayUrlToName("wss://down.relay");

function openMenu() {
  fireEvent.click(screen.getByTestId("mobile-space-selector"));
}

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
  useFilterStore.getState().setActiveRelayIds(() => new Set());
});

describe("MobileSpaceSelector", () => {
  it("lists All spaces, connected and disconnected spaces, and a connect entry", () => {
    render(<MobileSpaceSelector />);
    openMenu();
    expect(screen.getByText("All spaces")).toBeInTheDocument();
    expect(screen.getByText(tasksName)).toBeInTheDocument();
    expect(screen.getByText(downName)).toBeInTheDocument();
    expect(screen.getByText("Connect to another space")).toBeInTheDocument();
  });

  it("selects a space exclusively", () => {
    render(<MobileSpaceSelector />);
    openMenu();
    fireEvent.click(screen.getByText(tasksName));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.select",
      relayId: "tasks",
      mode: "exclusive",
    });
  });

  it("clears to all spaces", () => {
    useFilterStore.getState().setActiveRelayIds(() => new Set(["tasks"]));
    render(<MobileSpaceSelector />);
    openMenu();
    fireEvent.click(screen.getByText("All spaces"));
    expect(useFilterStore.getState().activeRelayIds.size).toBe(0);
  });

  it("connects a new space via the inline field", () => {
    render(<MobileSpaceSelector />);
    openMenu();
    fireEvent.click(screen.getByText("Connect to another space"));
    const input = screen.getByTestId("mobile-space-connect-input");
    fireEvent.change(input, { target: { value: "wss://new.relay" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "sidebar.relay.add",
      url: "wss://new.relay",
    });
  });
});
