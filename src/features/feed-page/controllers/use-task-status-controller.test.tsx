import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskStatusController } from "./use-task-status-controller";
import { useTaskMutationStore } from "@/features/feed-page/stores/task-mutation-store";
import { makePerson, makeTask } from "@/test/fixtures";
import { getTaskStatusType } from "@/types";
import * as taskStateConfig from "@/domain/task-states/task-state-config";

const author = makePerson({ id: "author-pubkey", name: "author", displayName: "Author" });
const initialTask = makeTask({
  id: "task-1",
  author,
  status: "open",
  stateUpdates: [
    {
      id: "relay-state-1",
      status: { type: "open" },
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      authorPubkey: author.id,
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
      <button type="button" onClick={() => controller.handleStatusChange("task-1", { type: "done" })}>
        SetDone
      </button>
      <button type="button" onClick={() => controller.handleStatusChange("task-1", { type: "active" })}>
        SetInProgress
      </button>
      <button type="button" onClick={() => controller.handleToggleComplete("task-1")}>
        ToggleComplete
      </button>
      <output data-testid="status">{getTaskStatusType(allTasks[0]?.status) || ""}</output>
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
    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", { type: "done" });

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
    expect(publishTaskStateUpdate).toHaveBeenNthCalledWith(1, "task-1", { type: "done" });
    expect(publishTaskStateUpdate).toHaveBeenNthCalledWith(2, "task-1", { type: "active" });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("active");
    expect(screen.getByTestId("sort-hold")).toBeEmptyDOMElement();
  });

  it("does not cycle terminal tasks through quick toggle", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    useTaskMutationStore.setState({
      localTasks: [makeTask({ ...initialTask, status: "done" })],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "ToggleComplete" }));

    expect(screen.getByTestId("status")).toHaveTextContent("done");
    expect(publishTaskStateUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId("sort-hold")).toBeEmptyDOMElement();
  });

  it("publishes the registry's default done state with description for custom done labels", () => {
    // Simulate a registry where the first done-type state has id "review" / label "Review"
    const reviewState = {
      id: "review",
      type: "done" as const,
      label: "Review",
      icon: "circle-check-big",
      visibleByDefault: true,
    };
    const spy = vi
      .spyOn(taskStateConfig, "getDefaultStateForType")
      .mockImplementation((type) => (type === "done" ? reviewState : undefined));

    const publishTaskStateUpdate = vi.fn(async () => undefined);
    useTaskMutationStore.setState({
      localTasks: [makeTask({ ...initialTask, status: "active" })],
      postedTags: [],
      suppressedNostrEventIds: new Set(),
    });

    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    fireEvent.click(screen.getByRole("button", { name: "ToggleComplete" }));

    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", {
      type: "done",
      description: "Review",
    });
    expect(screen.getByTestId("status")).toHaveTextContent("done");

    spy.mockRestore();
  });
});
