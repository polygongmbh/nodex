import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskMentionChips } from "./TaskMentionChips";
import type { TaskPost } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import type { Person } from "@/types/person";
import { FeedInteractionProvider } from "@/features/feed-page/interactions/feed-interaction-context";

const alice: Person = {
  pubkey: "a".repeat(64),
  name: "alice",
  displayName: "Alice",
  picture: "",
};

const baseTask: TaskPost = {
  id: "task-1",
  kind: NostrEventKind.Task,
  pubkey: alice.pubkey,
  content: "Ship #general",
  tags: ["general"],
  relays: ["demo"],

  timestamp: new Date(),
  lastEditedAt: new Date(),
  stateUpdates: [],
  dates: [],
  assigneePubkeys: [],
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
        task={{ ...baseTask, assigneePubkeys: [alice.pubkey] }}
        people={[alice]}
      />
    );

    expect(screen.getByRole("button", { name: "@alice" })).toBeInTheDocument();
  });

  it("applies an exclusive person filter on Ctrl/Cmd+click", () => {
    const dispatch = renderWithDispatch(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [alice.pubkey] }}
        people={[alice]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "@alice" }), { ctrlKey: true });
    expect(dispatch).toHaveBeenCalledWith({ type: "person.filter.exclusive", pubkey: alice.pubkey });
  });

  it("stops plain mention clicks from bubbling to parent containers", () => {
    const parentClick = vi.fn();

    renderWithDispatch(
      <div onClick={parentClick}>
        <TaskMentionChips
          task={{ ...baseTask, mentions: [alice.pubkey] }}
          people={[alice]}
        />
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "@alice" }));

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

    const mentionChip = screen.getByRole("button", { name: /^@npub1/ });
    expect(mentionChip).toBeInTheDocument();
  });

  it("uses fallback person data for modifier actions when mention has no matched person", () => {
    const unmatchedPubkey = "b".repeat(64);
    const dispatch = renderWithDispatch(
      <TaskMentionChips
        task={{ ...baseTask, mentions: [unmatchedPubkey] }}
        people={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /^@npub1/ }), { altKey: true });
    expect(dispatch).toHaveBeenCalledWith({
      type: "person.compose.mention",
      pubkey: unmatchedPubkey,
    });
  });
});
