import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnifiedBottomBar } from "./UnifiedBottomBar";
import type { Channel, Person, Relay } from "@/types";

const relays: Relay[] = [
  { id: "demo", name: "Demo", icon: "D", isActive: true },
];

const channels: Channel[] = [
  { id: "general", name: "general", filterState: "neutral" },
];

const people: Person[] = [];

describe("UnifiedBottomBar auth gating", () => {
  it("opens sign-in when compose is tapped while signed out", () => {
    const onSignInClick = vi.fn();

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={() => {}}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={false}
        onSignInClick={onSignInClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /compose/i }));

    expect(onSignInClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText(/new task/i)).not.toBeInTheDocument();
  });
});
