import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PersonItem } from "./PersonItem";
import type { Person } from "@/types";

describe("PersonItem", () => {
  it("renders beam avatar fallback when person has no profile image", () => {
    const person: Person = {
      id: "npub123",
      name: "alice",
      displayName: "Alice",
      isOnline: true,
      isSelected: false,
    };

    render(<PersonItem person={person} onToggle={vi.fn()} />);

    expect(screen.getByTestId("sidebar-person-beam-npub123")).toBeInTheDocument();
  });
});
