import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonHoverCard, resumePersonHoverCards, suspendPersonHoverCards } from "./PersonHoverCard";
import type { Person } from "@/types/person";

const alice: Person = {
  id: "a".repeat(64),
  name: "alice",
  displayName: "Alice",
  about: "Alice bio",
  isOnline: true,
  isSelected: false,
};

const bob: Person = {
  id: "b".repeat(64),
  name: "bob",
  displayName: "Bob",
  about: "Bob bio",
  isOnline: false,
  isSelected: false,
};

describe("PersonHoverCard", () => {
  afterEach(() => {
    vi.useRealTimers();
    resumePersonHoverCards();
  });

  it("closes an already-open profile preview when another one opens", () => {
    vi.useFakeTimers();

    render(
      <>
        <PersonHoverCard person={alice}>
          <button type="button">Alice trigger</button>
        </PersonHoverCard>
        <PersonHoverCard person={bob}>
          <button type="button">Bob trigger</button>
        </PersonHoverCard>
      </>
    );

    const aliceTrigger = screen.getByRole("button", { name: "Alice trigger" });
    const bobTrigger = screen.getByRole("button", { name: "Bob trigger" });

    fireEvent.focus(aliceTrigger);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText("Alice bio")).toBeInTheDocument();

    fireEvent.focus(bobTrigger);
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByText("Alice bio")).not.toBeInTheDocument();
    expect(screen.getByText("Bob bio")).toBeInTheDocument();
  });

  it("prefers the currently hovered trigger over a previously focused one", () => {
    vi.useFakeTimers();

    render(
      <>
        <PersonHoverCard person={alice}>
          <button type="button">Alice trigger</button>
        </PersonHoverCard>
        <PersonHoverCard person={bob}>
          <button type="button">Bob trigger</button>
        </PersonHoverCard>
      </>
    );

    const aliceTrigger = screen.getByRole("button", { name: "Alice trigger" });
    const bobTrigger = screen.getByRole("button", { name: "Bob trigger" });

    fireEvent.focus(aliceTrigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("Alice bio")).toBeInTheDocument();

    fireEvent.mouseOver(bobTrigger);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText("Alice bio")).not.toBeInTheDocument();
    expect(screen.getByText("Bob bio")).toBeInTheDocument();
  });

  it("does not open a pending hover card while person overlays are suspended", () => {
    vi.useFakeTimers();

    render(
      <PersonHoverCard person={alice}>
        <button type="button">Alice trigger</button>
      </PersonHoverCard>
    );

    const trigger = screen.getByRole("button", { name: "Alice trigger" });

    fireEvent.mouseOver(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    suspendPersonHoverCards();
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText("Alice bio")).not.toBeInTheDocument();
  });
});
