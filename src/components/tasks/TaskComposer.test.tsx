import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TaskComposer } from "./TaskComposer";
import type { Channel, Relay, Person } from "@/types";

vi.mock("@/lib/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { id: "me" } }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const relays: Relay[] = [{
  id: "demo",
  name: "Demo",
  url: "wss://relay.example.com",
  icon: "R",
  isActive: true,
}];

const channels: Channel[] = [
  { id: "backend", name: "backend", filterState: "neutral" },
  { id: "design", name: "design", filterState: "neutral" },
];

const people: Person[] = [];

describe("TaskComposer hashtag autocomplete", () => {
  it("supports keyboard selection with Enter", () => {
    render(
      <TaskComposer
        onSubmit={() => {}}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
      />
    );

    const textarea = screen.getByPlaceholderText(/what needs to be done/i) as HTMLTextAreaElement;

    fireEvent.change(textarea, {
      target: { value: "#b", selectionStart: 2 },
    });

    expect(screen.getByText("backend")).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(textarea.value).toBe("#backend ");
  });

  it("stays compact in adaptive mode and expands on focus", () => {
    render(
      <TaskComposer
        onSubmit={() => {}}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        compact
        adaptiveSize
      />
    );

    expect(screen.queryByText("Set due date (optional)")).not.toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/what needs to be done/i);
    fireEvent.focus(textarea);

    expect(screen.getByText("Set due date (optional)")).toBeInTheDocument();
  });

  it("restores draft content from shared storage key", () => {
    localStorage.setItem(
      "nodex.compose-draft.shared",
      JSON.stringify({
        content: "#persisted hello",
        taskType: "comment",
      })
    );

    render(
      <TaskComposer
        onSubmit={() => {}}
        relays={relays}
        channels={channels}
        people={people}
        onCancel={() => {}}
        draftStorageKey="nodex.compose-draft.shared"
      />
    );

    expect(screen.getByDisplayValue("#persisted hello")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add a comment/i)).toBeInTheDocument();
  });
});
