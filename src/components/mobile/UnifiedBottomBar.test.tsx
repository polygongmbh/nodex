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
  it("opens sign-in when create is tapped while signed out", () => {
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

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Ship #general" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in to create/i }));

    expect(onSignInClick).toHaveBeenCalledTimes(1);
  });

  it("searches as user types in combined field", () => {
    const onSearchChange = vi.fn();
    render(
      <UnifiedBottomBar
        searchQuery=""
        onSearchChange={onSearchChange}
        onSubmit={() => {}}
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

    const field = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "hello #general" } });
    expect(onSearchChange).toHaveBeenLastCalledWith("hello #general");
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

    const composeField = screen.getByPlaceholderText(/search or create task/i) as HTMLTextAreaElement;
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

    fireEvent.click(screen.getByRole("button", { name: /comment/i }));
    const commentField = screen.getByPlaceholderText(/search or add comment/i) as HTMLTextAreaElement;
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
