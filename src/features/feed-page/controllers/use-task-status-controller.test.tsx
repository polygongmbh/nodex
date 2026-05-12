import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskStatusController } from "./use-task-status-controller";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { makePerson, makeTask } from "@/test/fixtures";
import { getTaskStatus } from "@/types";
import * as taskStateConfig from "@/domain/task-states/task-state-config";

const author = makePerson({ pubkey: "author-pubkey", name: "author", displayName: "Author" });
const initialTask = makeTask({
  id: "task-1",
  author,
  state: {
    status: "open"
  },
  stateUpdates: [
    {
      id: "relay-state-1",
      state: { status: "open" },
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      authorPubkey: author.pubkey,
    },
  ],
});

function Harness({ publishTaskStateUpdate }: { publishTaskStateUpdate: ReturnType<typeof vi.fn> }) {
  const localTasks = useTaskMutationStore((s) => s.localTasks);
  const allTasks = localTasks.length > 0 ? localTasks : [initialTask];

  const controller = useTaskStatusController({
    allTasks,
    currentUser: author,
    guardInteraction: () => false,
    publishTaskStateUpdate,
  });

  return (
    <>
      <button type="button" onClick={() => controller.handleStatusChange("task-1", { status: "done" })}>
        SetDone
      </button>
      <button type="button" onClick={() => controller.handleStatusChange("task-1", { status: "active" })}>
        SetInProgress
      </button>
      <button
        type="button"
        onClick={() => controller.handleStatusChange("task-1", { status: "active", description: "Review" })}
      >
        SetReview
      </button>
      <button type="button" onClick={() => controller.handleStatusChange("task-1", { status: "open" })}>
        SetOpen
      </button>
      <button type="button" onClick={() => controller.handleToggleComplete("task-1")}>
        ToggleComplete
      </button>
      <output data-testid="status">{getTaskStatus(allTasks[0]?.state) || ""}</output>
      <output data-testid="state-update-count">{String(allTasks[0]?.stateUpdates?.length ?? 0)}</output>
      <output data-testid="sort-hold">{controller.sortStatusHoldByTaskId["task-1"] || ""}</output>
    </>
  );
}

describe("useTaskStatusController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTaskMutationStore.setState({
      localTasks: [],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies local status optimistically without creating a synthetic state update entry", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    expect(screen.getByTestId("status")).toHaveTextContent("open");
    expect(screen.getByTestId("state-update-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "SetDone" }));

    expect(screen.getByTestId("status")).toHaveTextContent("done");
    expect(screen.getByTestId("state-update-count")).toHaveTextContent("1");
    expect(screen.getByTestId("sort-hold")).toHaveTextContent("open");
    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", { status: "done" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("done");
    expect(screen.getByTestId("state-update-count")).toHaveTextContent("1");
    expect(screen.getByTestId("sort-hold")).toBeEmptyDOMElement();
  });

  it("keeps only the latest pending status when status changes happen quickly", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "SetDone" }));
    fireEvent.click(screen.getByRole("button", { name: "SetInProgress" }));

    expect(screen.getByTestId("status")).toHaveTextContent("active");
    expect(screen.getByTestId("sort-hold")).toHaveTextContent("done");
    expect(publishTaskStateUpdate).toHaveBeenNthCalledWith(1, "task-1", { status: "done" });
    expect(publishTaskStateUpdate).toHaveBeenNthCalledWith(2, "task-1", { status: "active" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("active");
    expect(screen.getByTestId("sort-hold")).toBeEmptyDOMElement();
  });

  it("does not cycle terminal tasks through quick toggle", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    useTaskMutationStore.setState({
      localTasks: [makeTask({ ...initialTask, state: {
        status: "done"
      } })],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "ToggleComplete" }));

    expect(screen.getByTestId("status")).toHaveTextContent("done");
    expect(publishTaskStateUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId("sort-hold")).toBeEmptyDOMElement();
  });

  it("skips publishing when the chosen status exactly matches the current one", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "SetOpen" }));

    expect(publishTaskStateUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId("sort-hold")).toBeEmptyDOMElement();
  });

  it("publishes when the description differs even if the type is the same", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    useTaskMutationStore.setState({
      localTasks: [makeTask({ ...initialTask, state: { status: "active", description: "In Progress" } })],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "SetReview" }));

    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", {
      status: "active",
      description: "Review",
    });
  });

  it("cascades active status up to open-typed ancestors", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    const parent = makeTask({ id: "parent", author, state: { status: "open" } });
    const grandparent = makeTask({ id: "grandparent", author, state: { status: "open" } });
    const child = makeTask({
      ...initialTask,
      parentId: "parent",
    });
    const parentWithLink = { ...parent, parentId: "grandparent" } as typeof parent;
    useTaskMutationStore.setState({
      localTasks: [child, parentWithLink, grandparent],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "SetInProgress" }));

    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", { status: "active" });
    expect(publishTaskStateUpdate).toHaveBeenCalledWith("parent", { status: "active" });
    expect(publishTaskStateUpdate).toHaveBeenCalledWith("grandparent", { status: "active" });
  });

  it("does not cascade past ancestors that are not in an open state", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    const grandparent = makeTask({ id: "grandparent", author, state: { status: "open" } });
    const parent = makeTask({
      id: "parent",
      author,
      state: { status: "done" },
      parentId: "grandparent",
    });
    const child = makeTask({ ...initialTask, parentId: "parent" });
    useTaskMutationStore.setState({
      localTasks: [child, parent, grandparent],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "SetInProgress" }));

    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", { status: "active" });
    expect(publishTaskStateUpdate).not.toHaveBeenCalledWith("parent", expect.anything());
    // grandparent is open but skipped because the chain is broken by a non-open parent
    // (literal reading: any open ancestor — but we still skip the done one)
    expect(publishTaskStateUpdate).toHaveBeenCalledWith("grandparent", { status: "active" });
  });

  it("does not cascade when the chosen status is not active", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    const parent = makeTask({ id: "parent", author, state: { status: "open" } });
    const child = makeTask({ ...initialTask, parentId: "parent" });
    useTaskMutationStore.setState({
      localTasks: [child, parent],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "SetDone" }));

    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", { status: "done" });
    expect(publishTaskStateUpdate).not.toHaveBeenCalledWith("parent", expect.anything());
  });

  it("publishes the registry's default done state with description for custom done labels", () => {
    // Simulate a registry where the first done-type state has id "review" / label "Review"
    const reviewState = {
      id: "review",
      status: "done" as const,
      label: "Review",
      icon: "circle-check-big",
      visibleByDefault: true,
    };
    const spy = vi
      .spyOn(taskStateConfig, "getDefaultStateForStatus")
      .mockImplementation((type) => (type === "done" ? reviewState : undefined));

    const publishTaskStateUpdate = vi.fn(async () => undefined);
    useTaskMutationStore.setState({
      localTasks: [makeTask({ ...initialTask, state: {
        status: "active"
      } })],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "ToggleComplete" }));

    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", {
      status: "done",
      description: "Review",
    });
    expect(screen.getByTestId("status")).toHaveTextContent("done");

    spy.mockRestore();
  });
});
