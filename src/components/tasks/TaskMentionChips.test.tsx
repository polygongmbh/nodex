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
});

