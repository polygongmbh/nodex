import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskMentionChips } from "./TaskMentionChips";
import type { Person, Task } from "@/types";

const alice: Person = {
  id: "a".repeat(64),
  name: "alice",
  displayName: "Alice",
  avatar: "",
  isOnline: true,
  isSelected: false,
};

const baseTask: Task = {
  id: "task-1",
  author: alice,
  content: "Ship #general",
  tags: ["general"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
};

describe("TaskMentionChips", () => {
  it("renders mention chips from non-text assignee pubkeys", () => {
    render(
      <TaskMentionChips
        task={{ ...baseTask, assigneePubkeys: [alice.id] }}
        people={[alice]}
      />
    );

    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("triggers person callback when mention chip is clicked", () => {
    const onPersonClick = vi.fn();

    render(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [alice.id] }}
        people={[alice]}
        onPersonClick={onPersonClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open user alice" }));
    expect(onPersonClick).toHaveBeenCalledWith(alice);
  });

  it("renders npub fallback when mention has no matched person", () => {
    const unmatchedPubkey = "b".repeat(64);

    render(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [unmatchedPubkey] }}
        people={[]}
      />
    );

    const mentionChip = screen.getByText((value) => value.includes("npub1"));
    expect(mentionChip).toBeInTheDocument();
    expect(mentionChip.closest("span")).toHaveAttribute("title", expect.stringContaining("@npub1"));
  });

  it("uses fallback person callback when mention has no matched person", () => {
    const unmatchedPubkey = "b".repeat(64);
    const onPersonClick = vi.fn();

    render(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [unmatchedPubkey] }}
        people={[]}
        onPersonClick={onPersonClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /open user npub1/i }));
    expect(onPersonClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: unmatchedPubkey,
        isOnline: false,
        isSelected: false,
      })
    );
  });
});
