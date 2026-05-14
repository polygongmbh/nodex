import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusedTaskBreadcrumb } from "./FocusedTaskBreadcrumb";
import type { Post, TaskPost } from "@/types";
import { NostrEventKind } from "@/lib/nostr/types";
import { makePerson } from "@/test/fixtures";

const dispatchFeedInteraction = vi.fn();
const navigate = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

const baseTask: TaskPost = {
  id: "root",
  kind: NostrEventKind.Task,
  author: makePerson({ pubkey: "me", name: "me", displayName: "Me" }),
  content: "Root task",
  tags: [],
  relays: [],

  timestamp: new Date(),
  lastEditedAt: new Date(),
  stateUpdates: [],
  dates: [],
  assigneePubkeys: [],
};

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
  navigate.mockClear();
});

describe("FocusedTaskBreadcrumb", () => {
  it("renders all tasks breadcrumb even when no task is focused", () => {
    render(<FocusedTaskBreadcrumb allTasks={[baseTask]} focusedTaskId={null} />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Up" })).toBeDisabled();
  });

  it("renders full path and makes each level clickable", () => {
    const middle: Post = {
      ...baseTask,
      id: "middle",
      content: "Middle task",
      parentId: "root",
    };
    const leaf: Post = {
      ...baseTask,
      id: "leaf",
      content: "Leaf task",
      parentId: "middle",
    };

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, middle, leaf]}
        focusedTaskId="leaf"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Root task" }));
    fireEvent.click(screen.getByRole("button", { name: "Middle task" }));
    fireEvent.click(screen.getByRole("button", { name: "Leaf task" }));
    fireEvent.click(screen.getByRole("button", { name: "Up" }));

    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(1, { type: "task.focus.change", taskId: null });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(2, { type: "task.focus.change", taskId: "root" });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(3, { type: "task.focus.change", taskId: "middle" });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(4, { type: "task.focus.change", taskId: "leaf" });
    expect(dispatchFeedInteraction).toHaveBeenNthCalledWith(5, { type: "task.focus.change", taskId: "middle" });
  });

  it("navigates back in history when clicking back", () => {
    render(<FocusedTaskBreadcrumb allTasks={[baseTask]} focusedTaskId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("formats breadcrumb labels to first-line plain text without mentions or hashtag markers", () => {
    const longContent = "Task delegated to @averylongusername with enough room to display #frontend!!!\nSecond line";
    const longTask: Post = {
      ...baseTask,
      id: "long",
      content: longContent,
      parentId: "root",
    };

    render(
      <FocusedTaskBreadcrumb
        allTasks={[baseTask, longTask]}
        focusedTaskId="long"
      />
    );

    expect(screen.getByRole("button", { name: "Task delegated to with enough room to display frontend!!!" })).toBeInTheDocument();
  });

});
