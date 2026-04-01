import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonItem } from "./PersonItem";
import type { Person } from "@/types";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

const basePerson: Person = {
  id: "npub123",
  name: "alice",
  displayName: "Alice",
  isOnline: true,
  isSelected: false,
};

describe("PersonItem", () => {
  const renderPersonItem = (person: Person) => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
      outcome: { status: "handled" },
    });
    render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <PersonItem person={person} />
      </FeedInteractionProvider>
    );
    return dispatch;
  };

  it("renders beam avatar fallback when person has no profile image", () => {
    renderPersonItem(basePerson);

    expect(screen.getByTestId("sidebar-person-beam-npub123")).toBeInTheDocument();
  });

  it("enables exclusive filter when clicking the person text", () => {
    const dispatch = renderPersonItem(basePerson);

    const exclusiveButton = screen.getByTestId("person-item-exclusive-npub123");

    fireEvent.click(exclusiveButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.person.exclusive", personId: "npub123" });
  });

  it("toggles filter when clicking the avatar", () => {
    const dispatch = renderPersonItem(basePerson);

    fireEvent.click(screen.getByTestId("person-item-toggle-npub123"));

    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.person.toggle", personId: "npub123" });
  });

  it("dispatches pin and unpin actions from the shared pin button", () => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
      outcome: { status: "handled" },
    });

    const { rerender } = render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <PersonItem person={basePerson} isPinned={false} />
      </FeedInteractionProvider>
    );

    fireEvent.click(screen.getByTestId("person-item-pin-npub123"));
    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.person.pin", personId: "npub123" });

    rerender(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        <PersonItem person={basePerson} isPinned={true} />
      </FeedInteractionProvider>
    );

    fireEvent.click(screen.getByTestId("person-item-pin-npub123"));
    expect(dispatch).toHaveBeenCalledWith({ type: "sidebar.person.unpin", personId: "npub123" });
  });
});
