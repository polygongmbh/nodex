import { fireEvent, render, screen, within } from "@testing-library/react";
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

function getSectionToggle(sectionLabel: "channels-section" | "people-section" | "relays-section") {
  const section = document.querySelector(`[data-onboarding="${sectionLabel}"]`);
  expect(section).toBeTruthy();
  return within(section as HTMLElement).getByRole("button", { expanded: false });
}

describe("Sidebar", () => {
  it("preserves spaces section expansion state across remounts while relay lists change", () => {
    const firstRender = renderSidebar(baseRelays);
    const relayOneRow = document.querySelector('[data-sidebar-item="relay-relay-one"]') as HTMLElement;
    const expectCollapsed = (element: HTMLElement | null) => {
      expect(element?.style.height).toBe("0px");
    };

    fireEvent.click(screen.getByRole("button", { name: /collapse spaces/i }));
    expectCollapsed(relayOneRow.parentElement?.parentElement as HTMLElement);

    firstRender.unmount();

    renderSidebar([...baseRelays, extraRelay]);

    const remountedRelayOneRow = document.querySelector('[data-sidebar-item="relay-relay-one"]') as HTMLElement;
    const remountedRelayTwoRow = document.querySelector('[data-sidebar-item="relay-relay-two"]') as HTMLElement;

    expectCollapsed(remountedRelayOneRow.parentElement?.parentElement as HTMLElement);
    expectCollapsed(remountedRelayTwoRow.parentElement?.parentElement as HTMLElement);
  });

  it("starts channels and people folded by default", () => {
    renderSidebar(baseRelays);

    expect(getSectionToggle("channels-section")).toHaveAttribute("aria-expanded", "false");
    expect(getSectionToggle("people-section")).toHaveAttribute("aria-expanded", "false");
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

    expect(document.querySelector('[data-sidebar-item="channel-release"]')).toBeVisible();
  });

  it("uses scoped collapsed preview lists when provided", () => {
    const foldedChannels: Channel[] = [
      { id: "general", name: "general", filterState: "neutral", usageCount: 10 },
      { id: "ops", name: "ops", filterState: "neutral", usageCount: 9 },
      { id: "release", name: "release", filterState: "neutral", usageCount: 8 },
    ];
    const foldedPeople: Person[] = [
      { id: "alice", name: "alice", displayName: "Alice", avatar: "", isOnline: true, isSelected: false },
      { id: "bob", name: "bob", displayName: "Bob", avatar: "", isOnline: true, isSelected: false },
    ];

    render(
      <Sidebar
        relays={baseRelays}
        channels={foldedChannels}
        collapsedPreviewChannels={[foldedChannels[1]]}
        people={foldedPeople}
        collapsedPreviewPeople={[foldedPeople[1]]}
        nostrRelays={nostrRelays}
      />
    );

    expect(document.querySelector('[data-sidebar-item="channel-ops"]')?.className).not.toContain("hidden");
    expect(document.querySelector('[data-sidebar-item="channel-general"]')?.className).toContain("hidden");
    expect(document.querySelector('[data-sidebar-item="channel-release"]')?.className).toContain("hidden");
    expect(document.querySelector('[data-sidebar-item="person-bob"]')?.className).not.toContain("hidden");
    expect(document.querySelector('[data-sidebar-item="person-alice"]')?.className).toContain("hidden");
  });
});
