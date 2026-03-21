import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Channel, Person, Relay } from "@/types";
import type { NDKRelayStatus } from "@/infrastructure/nostr/ndk-context";

const baseRelays: Relay[] = [
  {
    id: "relay-one",
    name: "Relay One",
    icon: "radio",
    isActive: true,
    connectionStatus: "connected",
    url: "wss://relay.one",
  },
];

const extraRelay: Relay = {
  id: "relay-two",
  name: "Relay Two",
  icon: "radio",
  isActive: true,
  connectionStatus: "connected",
  url: "wss://relay.two",
};

const nostrRelays: NDKRelayStatus[] = [
  { url: "wss://relay.one", status: "connected" },
  { url: "wss://relay.two", status: "connected" },
];

const channels: Channel[] = [{ id: "general", name: "general", filterState: "neutral" }];
const people: Person[] = [{ id: "alice", name: "alice", displayName: "Alice", avatar: "", isOnline: true, isSelected: false }];

function renderSidebar(relays: Relay[]) {
  return render(
    <Sidebar
      relays={relays}
      channels={channels}
      people={people}
      nostrRelays={nostrRelays}
    />
  );
}

describe("Sidebar", () => {
  it("preserves feeds section expansion state across remounts while relay lists change", () => {
    const firstRender = renderSidebar(baseRelays);
    const relayOneRow = screen.getByText("Relay One").closest('[data-sidebar-item="relay-relay-one"]') as HTMLElement;
    const expectCollapsed = (element: HTMLElement | null) => {
      expect(element?.style.height).toBe("0px");
    };

    fireEvent.click(screen.getByRole("button", { name: /collapse feeds/i }));
    expectCollapsed(relayOneRow.parentElement?.parentElement as HTMLElement);

    firstRender.unmount();

    renderSidebar([...baseRelays, extraRelay]);

    const remountedRelayOneRow = screen.getByText("Relay One").closest('[data-sidebar-item="relay-relay-one"]') as HTMLElement;
    const remountedRelayTwoRow = screen.getByText("Relay Two").closest('[data-sidebar-item="relay-relay-two"]') as HTMLElement;

    expectCollapsed(remountedRelayOneRow.parentElement?.parentElement as HTMLElement);
    expectCollapsed(remountedRelayTwoRow.parentElement?.parentElement as HTMLElement);
  });

  it("starts channels and people folded by default", () => {
    renderSidebar(baseRelays);

    expect(screen.getByRole("button", { name: /expand \(all\) channels/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /expand \(all\) people/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps pinned channels visible in folded mode", () => {
    const foldedChannels: Channel[] = [
      { id: "general", name: "general", filterState: "neutral", usageCount: 10 },
      { id: "ops", name: "ops", filterState: "neutral", usageCount: 9 },
      { id: "design", name: "design", filterState: "neutral", usageCount: 8 },
      { id: "release", name: "release", filterState: "neutral", usageCount: 7 },
    ];

    render(
      <Sidebar
        relays={baseRelays}
        channels={foldedChannels}
        people={people}
        nostrRelays={nostrRelays}
        pinnedChannelIds={["release"]}
      />
    );

    expect(screen.getByRole("button", { name: "Show only #release" })).toBeInTheDocument();
  });
});
