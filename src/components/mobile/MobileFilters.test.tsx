import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileFilters } from "./MobileFilters";
import type { Channel, Person, Relay } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({
    user: {
      pubkey: "abc123",
      npub: "npub1abc",
      profile: { displayName: "Guest User" },
    },
    authMethod: "guest",
    logout: vi.fn(),
    getGuestPrivateKey: () => "f".repeat(64),
  }),
}));

const relays: Relay[] = [
  { id: "demo", name: "Demo", icon: "D", isActive: true },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
];

const people: Person[] = [
  {
    id: "p1",
    name: "Alice",
    displayName: "Alice",
    avatar: "",
    isOnline: true,
    isSelected: false,
  },
];

describe("MobileFilters management view", () => {
  it("supports adding a new feed and showing profile controls", () => {
    const onAddRelay = vi.fn();

    render(
      <MobileFilters
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        onAddRelay={onAddRelay}
        onRemoveRelay={() => {}}
        onSignInClick={() => {}}
        onGuideClick={() => {}}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/wss:\/\/relay\.example\.com/i), {
      target: { value: "wss://relay.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add feed/i }));

    expect(onAddRelay).toHaveBeenCalledWith("wss://relay.example.com");
    expect(screen.getByRole("button", { name: /copy private key/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByText(/^v\d+\.\d+\.\d+$/)).toBeInTheDocument();
  });
});
