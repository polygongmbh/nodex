import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonItem } from "./PersonItem";
import type { Person } from "@/types";

const basePerson: Person = {
  id: "npub123",
  name: "alice",
  displayName: "Alice",
  isOnline: true,
  isSelected: false,
};

describe("PersonItem", () => {
  it("renders beam avatar fallback when person has no profile image", () => {
    render(<PersonItem person={basePerson} onToggle={vi.fn()} onExclusive={vi.fn()} />);

    expect(screen.getByTestId("sidebar-person-beam-npub123")).toBeInTheDocument();
  });

  it("toggles filter when clicking the person text", () => {
    const onToggle = vi.fn();
    const onExclusive = vi.fn();

    render(<PersonItem person={basePerson} onToggle={onToggle} onExclusive={onExclusive} />);

    fireEvent.click(screen.getByRole("button", { name: "Alice" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onExclusive).not.toHaveBeenCalled();
  });

  it("enables exclusive filter when clicking the avatar", () => {
    const onToggle = vi.fn();
    const onExclusive = vi.fn();

    render(<PersonItem person={basePerson} onToggle={onToggle} onExclusive={onExclusive} />);

    fireEvent.click(screen.getByRole("button", { name: "Show only Alice" }));

    expect(onExclusive).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
