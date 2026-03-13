import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";
import type { Channel, Person, Relay } from "@/types";
import type { NDKRelayStatus } from "@/lib/nostr/ndk-context";

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
const people: Person[] = [];

function renderSidebar(relays: Relay[]) {
  return render(
    <Sidebar
      relays={relays}
      channels={channels}
      people={people}
      nostrRelays={nostrRelays}
      onRelayToggle={() => {}}
      onRelayExclusive={() => {}}
      onChannelToggle={() => {}}
      onChannelExclusive={() => {}}
      onPersonToggle={() => {}}
      onPersonExclusive={() => {}}
      onToggleAllRelays={() => {}}
      onToggleAllChannels={() => {}}
      onToggleAllPeople={() => {}}
      onAddRelay={() => {}}
      onRemoveRelay={() => {}}
    />
  );
}

describe("Sidebar", () => {
  it("preserves feeds section expansion state across remounts while relay lists change", () => {
    const firstRender = renderSidebar(baseRelays);
    const relayOneRow = screen.getByText("Relay One").closest('[data-sidebar-item="relay-relay-one"]') as HTMLElement;
    const expectCollapsed = (element: HTMLElement | null) => {
      expect(element?.style.height).toBe("0px");
      expect(element).toHaveClass("motion-sidebar-fold-close");
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
});
