import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TaskTree } from "./TaskTree";
import { TaskViewStatusRow } from "./TaskViewStatusRow";
import { FeedSurfaceProvider, type FeedSurfaceState } from "@/features/feed-page/views/feed-surface-context";
import type { Channel, Relay, Task } from "@/types";
import type { SelectablePerson } from "@/types/person";
import { makePerson } from "@/test/fixtures";
import { makeQuickFilterState } from "@/test/quick-filter-state";

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: { pubkey: "me" } }),
}));

const dispatchFeedInteraction = vi.fn();

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

const relays: Relay[] = [{ id: "demo", name: "Demo", isActive: true, url: "wss://demo.test" }];
const channels: Channel[] = [{ id: "general", name: "general", filterState: "neutral" }];
const people: SelectablePerson[] = [];

const rootTask: Task = {
  id: "root",
  author: makePerson({ pubkey: "me", name: "me", displayName: "Me" }),
  content: "Root task",
  tags: ["general"],
  relays: ["demo"],
  taskType: "task",
  timestamp: new Date(),
  lastEditedAt: new Date(),
  likes: 0,
  replies: 0,
  reposts: 0,
  status: "open",
};

const childTask: Task = {
  ...rootTask,
  id: "child",
  content: "Child task",
  parentId: "root",
};

const doneGrandchildTask: Task = {
  ...rootTask,
  id: "done-grandchild",
  content: "Done grandchild",
  parentId: "root",
  status: "done",
};

function renderTaskTree(
  ui: ReactNode,
  surfaceOverrides: Partial<FeedSurfaceState> = {}
) {
  const surfaceState: FeedSurfaceState = {
    relays,
    channels,
    composeChannels: channels,
    people,
    mentionablePeople: people,
    searchQuery: "",
    quickFilters: makeQuickFilterState(),
    channelMatchMode: "and",
    ...surfaceOverrides,
  };

  return render(<FeedSurfaceProvider value={surfaceState}>{ui}</FeedSurfaceProvider>);
}

describe("TaskTree focus sync", () => {
  it("uses focusedTaskId as context and supports going up through focus dispatch", () => {
    dispatchFeedInteraction.mockClear();
    renderTaskTree(
      <>
        <TaskViewStatusRow allTasks={[rootTask, childTask]} focusedTaskId="root" />
        <TaskTree tasks={[rootTask, childTask]} allTasks={[rootTask, childTask]} focusedTaskId="root" />
      </>
    );

    expect(screen.getByText("Child task")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /up/i }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: null });
  });

  it("activates a task when clicking it from the focused composer", () => {
    dispatchFeedInteraction.mockClear();
    renderTaskTree(
      <>
        <TaskViewStatusRow allTasks={[rootTask, childTask]} focusedTaskId="root" />
        <TaskTree tasks={[rootTask, childTask]} allTasks={[rootTask, childTask]} focusedTaskId="root" />
      </>
    );

    const composerInput = screen.getByRole("textbox");
    fireEvent.focus(composerInput);

    const taskButton = screen.getByText("Child task").closest('[role="button"]');
    expect(taskButton).not.toBeNull();
    if (!taskButton) {
      throw new Error("Expected task button for Child task");
    }
    fireEvent.mouseDown(taskButton);
    fireEvent.click(taskButton);

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "child" });
  });

  it("keeps done subtasks behind the third fold state when only broader scope filters are active", () => {
    dispatchFeedInteraction.mockClear();
    renderTaskTree(
      <TaskTree
        focusedTaskId={null}
        tasks={[rootTask, childTask, doneGrandchildTask]}
        allTasks={[rootTask, childTask, doneGrandchildTask]}
      />,
      {
        quickFilters: makeQuickFilterState({ recentEnabled: true, recentDays: 30 }),
      }
    );

    const foldToggle = screen.getByTestId("tree-fold-toggle-root");

    expect(foldToggle).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.getByText("Child task")).toBeInTheDocument();
    expect(screen.queryByText("Done grandchild")).not.toBeInTheDocument();

    fireEvent.click(foldToggle);
    expect(screen.getByTestId("tree-fold-toggle-root")).toHaveAttribute("data-fold-state", "collapsed");
    expect(screen.queryByText("Child task")).not.toBeInTheDocument();
    expect(screen.queryByText("Done grandchild")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tree-fold-toggle-root"));
    expect(screen.getByTestId("tree-fold-toggle-root")).toHaveAttribute("data-fold-state", "allVisible");
    expect(screen.getByText("Child task")).toBeInTheDocument();
    expect(screen.getByText("Done grandchild")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tree-fold-toggle-root"));
    expect(screen.getByTestId("tree-fold-toggle-root")).toHaveAttribute("data-fold-state", "matchingOnly");
    expect(screen.getByText("Child task")).toBeInTheDocument();
    expect(screen.queryByText("Done grandchild")).not.toBeInTheDocument();
  });
});
