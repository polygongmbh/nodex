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
  it("submits as opposite kind on Alt+Enter in compose mode", () => {
    const onSubmit = vi.fn();

    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={() => {}}
        onSubmit={onSubmit}
        relays={relays}
        channels={channels}
        people={people}
        onRelayToggle={() => {}}
        onChannelToggle={() => {}}
        onPersonToggle={() => {}}
        isSignedIn={true}
        onSignInClick={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /compose/i }));
    const composeField = screen.getByPlaceholderText(/new task/i) as HTMLTextAreaElement;
    fireEvent.change(composeField, { target: { value: "Ship #general" } });

    fireEvent.keyDown(composeField, { key: "Enter", altKey: true });
    expect(onSubmit).toHaveBeenCalledWith(
      "Ship #general",
      ["general"],
      ["demo"],
      "comment",
      undefined,
      undefined
    );

    fireEvent.click(screen.getByRole("button", { name: /compose/i }));
    fireEvent.click(screen.getByRole("button", { name: /comment/i }));
    const commentField = screen.getByPlaceholderText(/add comment/i) as HTMLTextAreaElement;
    fireEvent.change(commentField, { target: { value: "Reply #general" } });

    fireEvent.keyDown(commentField, { key: "Enter", altKey: true });
    expect(onSubmit).toHaveBeenLastCalledWith(
      "Reply #general",
      ["general"],
      ["demo"],
      "task",
      undefined,
      undefined
    );
  });
});
