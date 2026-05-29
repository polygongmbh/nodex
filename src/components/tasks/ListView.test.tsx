import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ListView } from "./ListView";
import { makeChannel, makePerson, makeRelay, makeTask } from "@/test/fixtures";
import { usePreferencesStore } from "@/features/feed-page/stores/preferences-store";
import { useCurrentUserStore } from "@/features/feed-page/stores/current-user-store";

let mockUser: { id: string } | null = { id: "me" };
const dispatchFeedInteraction = vi.fn();

vi.mock("@/infrastructure/nostr/ndk-context", () => ({
  useNDK: () => ({ user: mockUser }),
}));

vi.mock("@/features/feed-page/interactions/feed-interaction-context", () => ({
  useFeedInteractionDispatch: () => dispatchFeedInteraction,
}));

beforeEach(() => {
  dispatchFeedInteraction.mockClear();
  // Tests pre-date depthMode being store-backed; restore the legacy default.
  usePreferencesStore.getState().setDisplayDepthMode("leaves");
  // Most tests rely on the signed-in user matching the default task author
  // ("author-pubkey") so status toggles and priority controls are enabled.
  useCurrentUserStore
    .getState()
    .setCurrentUser(makePerson({ pubkey: "author-pubkey", name: "author", displayName: "Author" }));
});

describe("ListView priority control", () => {
  it("focuses ancestor from breadcrumb without selecting current row task", () => {
    mockUser = { id: "me" };
    const root = makeTask({ id: "root", content: "Root task #general", state: {
      status: "open"
    } });
    const child = makeTask({ id: "child", parentId: "root", content: "Child task #general", state: {
      status: "open"
    } });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ pubkey: root.author.pubkey, name: root.author.name, displayName: root.author.displayName })];
    render(
      <ListView posts={[root, child]} />
    );

    fireEvent.click(screen.getByRole("button", { name: new RegExp("\\broot task general\\b", "i") }));
    expect(dispatchFeedInteraction).toHaveBeenCalledWith({ type: "task.focus.change", taskId: "root" });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "child" });
  });

  it("omits the active focused item from row breadcrumbs", () => {
    mockUser = { id: "me" };
    const root = makeTask({ id: "root", content: "Root task #general", state: {
      status: "open"
    } });
    const middle = makeTask({ id: "middle", parentId: "root", content: "Middle task #general", state: {
      status: "open"
    } });
    const leaf = makeTask({ id: "leaf", parentId: "middle", content: "Leaf task #general", state: {
      status: "open"
    } });

    render(
      <MemoryRouter initialEntries={["/list/middle"]}>
        <Routes>
          <Route path="/:view/:taskId" element={<ListView posts={[root, middle, leaf]} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: new RegExp("\\broot task general\\b", "i") })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp("\\bmiddle task general\\b", "i") })).not.toBeInTheDocument();
  });

  it("keeps priority select focused across unrelated parent rerenders", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-priority",
      priority: 40,
      content: "Task content #general",
    });
    const tasks = [task];
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ pubkey: task.author.pubkey, name: task.author.name, displayName: task.author.displayName })];
    const onUpdatePriority = vi.fn();

    const { rerender } = render(
      <ListView posts={tasks} />
    );

    const [prioritySelect] = screen.getAllByRole("combobox");
    prioritySelect.focus();
    expect(prioritySelect).toHaveFocus();

    rerender(
      <ListView posts={tasks} />
    );

    const [prioritySelectAfter] = screen.getAllByRole("combobox");
    expect(prioritySelectAfter).toBe(prioritySelect);
    expect(prioritySelectAfter).toHaveFocus();
  });

  it("disables task change controls when signed out", () => {
    mockUser = null;
    useCurrentUserStore.getState().setCurrentUser(undefined);
    const task = makeTask({
      id: "task-locked",
      priority: 40,
      content: "Task content #general",
    });
    const tasks = [task];
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ pubkey: task.author.pubkey, name: task.author.name, displayName: task.author.displayName })];
    const { container } = render(
      <ListView posts={tasks} />
    );

    const taskRow = container.querySelector('[data-task-id="task-locked"]') as HTMLElement;
    expect(within(taskRow).getByTestId("priority-select")).toBeDisabled();
    expect(screen.getByRole("button", { name: /set date/i })).toBeDisabled();
  });

  it("does not focus a task after checkbox quick-toggle in table view", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-focus",
      content: "Task content #general",
      state: {
        status: "open"
      },
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ pubkey: task.author.pubkey, name: task.author.name, displayName: task.author.displayName })];
    render(
      <ListView posts={[task]} />
    );

    const statusButton = screen.getByTestId("task-status-toggle");
    fireEvent.pointerDown(statusButton);
    fireEvent.click(statusButton, { detail: 1 });

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.toggleComplete",
      taskId: "task-focus",
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-focus" });
  });

  it("does not focus a task after option-clicking its checkbox", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-option",
      content: "Task content #general",
      state: {
        status: "open"
      },
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ pubkey: task.author.pubkey, name: task.author.name, displayName: task.author.displayName })];

    render(
      <ListView posts={[task]} />
    );

    fireEvent.click(screen.getByTestId("task-status-toggle"), { altKey: true });

    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-option" });
  });

  it("does not focus a task after selecting a dropdown status in table view", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-dropdown",
      content: "Task content #general",
      state: {
        status: "done"
      },
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ pubkey: task.author.pubkey, name: task.author.name, displayName: task.author.displayName })];
    render(
      <ListView posts={[task]} />
    );

    fireEvent.click(screen.getByTestId("task-status-toggle"));
    fireEvent.click(screen.getByText("In Progress"));

    expect(dispatchFeedInteraction).toHaveBeenCalledWith({
      type: "task.changeStatus",      taskId: "task-dropdown",
      state: { status: "active" },
    });
    expect(dispatchFeedInteraction).not.toHaveBeenCalledWith({ type: "task.focus.change", taskId: "task-dropdown" });
  });

  it("opens the status dropdown on pointer down for direct-selection cases", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-direct-select",
      content: "Task content #general",
      state: {
        status: "done"
      },
    });
    const relays = [makeRelay()];
    const channels = [makeChannel()];
    const people = [makePerson({ pubkey: task.author.pubkey, name: task.author.name, displayName: task.author.displayName })];

    render(
      <ListView posts={[task]} />
    );

    fireEvent.pointerDown(screen.getByTestId("task-status-toggle"));

    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("renders breadcrumb-formatted plain text previews without autolink in table rows", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-first-line",
      content: "Top line #frontend **bold** https://example.com/image.png\nSecond line should be hidden",
      state: {
        status: "open"
      },
    });

    render(
      <ListView posts={[task]} />
    );

    const preview = screen.getByText("Top line frontend bold https://example.com/image.png");
    expect(preview).toBeInTheDocument();
    expect(preview).not.toHaveTextContent("Second line should be hidden");
    expect(screen.queryByRole("link", { name: "https://example.com/image.png" })).not.toBeInTheDocument();
  });

  it("reuses breadcrumb stripping to remove raw pubkey mention tokens from table previews", () => {
    mockUser = { id: "me" };
    const task = makeTask({
      id: "task-pubkey-preview",
      content: "nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq can you try implementing this",
      state: {
        status: "open"
      },
    });

    render(
      <ListView posts={[task]} />
    );

    expect(screen.getByText("can you try implementing this")).toBeInTheDocument();
    expect(screen.queryByText(/nostr:npub1/i)).not.toBeInTheDocument();
  });
});
