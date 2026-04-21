import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskMentionChips } from "./TaskMentionChips";
import type { Task } from "@/types";
import type { Person } from "@/types/person";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

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
  const renderWithDispatch = (ui: ReactElement) => {
    const dispatch = vi.fn().mockResolvedValue({
      envelope: { id: 1, dispatchedAtMs: Date.now(), intent: { type: "ui.focusTasks" } },
      outcome: { status: "handled" },
    });
    render(
      <FeedInteractionProvider bus={{ dispatch, dispatchBatch: vi.fn().mockResolvedValue([]) }}>
        {ui}
      </FeedInteractionProvider>
    );
    return dispatch;
  };

  it("renders mention chips from non-text assignee pubkeys", () => {
    renderWithDispatch(
      <TaskMentionChips
        task={{ ...baseTask, assigneePubkeys: [alice.id] }}
        people={[alice]}
      />
    );

    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("applies an exclusive person filter on Ctrl/Cmd+click", () => {
    const dispatch = renderWithDispatch(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [alice.id] }}
        people={[alice]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Person actions for alice" }), { ctrlKey: true });
    expect(dispatch).toHaveBeenCalledWith({ type: "person.filter.exclusive", person: alice });
  });

  it("stops plain mention clicks from bubbling to parent containers", () => {
    const parentClick = vi.fn();

    renderWithDispatch(
      <div onClick={parentClick}>
        <TaskMentionChips
          task={{ ...baseTask, mentions: [alice.id] }}
          people={[alice]}
        />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "Person actions for alice" }));

    expect(parentClick).not.toHaveBeenCalled();
  });

  it("renders npub fallback when mention has no matched person", () => {
    const unmatchedPubkey = "b".repeat(64);

    renderWithDispatch(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [unmatchedPubkey] }}
        people={[]}
      />
    );

    const mentionChip = screen.getByRole("button", { name: /person actions for npub1/i });
    expect(mentionChip).toBeInTheDocument();
    expect(mentionChip).not.toHaveAttribute("title");
  });

  it("uses fallback person data for modifier actions when mention has no matched person", () => {
    const unmatchedPubkey = "b".repeat(64);
    const dispatch = renderWithDispatch(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [unmatchedPubkey] }}
        people={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /person actions for npub1/i }), { altKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "person.compose.mention",
      person: expect.objectContaining({
        id: unmatchedPubkey,
        isOnline: false,
        isSelected: false,
      }),
    });
  });
});
