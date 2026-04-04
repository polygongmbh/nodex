import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTaskStatusController } from "./use-task-status-controller";
import { makePerson, makeTask } from "@/test/fixtures";
import type { Task } from "@/types";

function Harness({ publishTaskStateUpdate }: { publishTaskStateUpdate: ReturnType<typeof vi.fn> }) {
  const author = makePerson({ id: "author-pubkey", name: "author", displayName: "Author" });
  const [localTasks, setLocalTasks] = useState<Task[]>([
    makeTask({
      id: "task-1",
      author,
      status: "todo",
      stateUpdates: [
        {
          id: "relay-state-1",
          status: "todo",
          timestamp: new Date("2026-01-01T00:00:00.000Z"),
          authorPubkey: author.id,
        },
      ],
    }),
  ]);

  const controller = useTaskStatusController({
    allTasks: localTasks,
    currentUser: author,
    guardInteraction: () => false,
    publishTaskStateUpdate,
    setLocalTasks,
  });

  return (
    <>
      <button type="button" onClick={() => controller.handleStatusChange("task-1", "done")}>
        SetDone
      </button>
      <button type="button" onClick={() => controller.handleStatusChange("task-1", "in-progress")}>
        SetInProgress
      </button>
      <output data-testid="status">{localTasks[0]?.status || ""}</output>
      <output data-testid="state-update-count">{String(localTasks[0]?.stateUpdates?.length ?? 0)}</output>
      <output data-testid="sort-hold">{controller.sortStatusHoldByTaskId["task-1"] || ""}</output>
    </>
  );
}

describe("useTaskStatusController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("applies local status optimistically without creating a synthetic state update entry", () => {
    const publishTaskStateUpdate = vi.fn(async () => undefined);
    render(<Harness publishTaskStateUpdate={publishTaskStateUpdate} />);

    expect(screen.getByTestId("status")).toHaveTextContent("todo");
    expect(screen.getByTestId("state-update-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "SetDone" }));

    expect(screen.getByTestId("status")).toHaveTextContent("done");
    expect(screen.getByTestId("state-update-count")).toHaveTextContent("1");
    expect(screen.getByTestId("sort-hold")).toHaveTextContent("todo");
    expect(publishTaskStateUpdate).toHaveBeenCalledWith("task-1", "done");

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

    expect(screen.getByTestId("status")).toHaveTextContent("in-progress");
    expect(screen.getByTestId("sort-hold")).toHaveTextContent("done");
    expect(publishTaskStateUpdate).toHaveBeenNthCalledWith(1, "task-1", "done");
    expect(publishTaskStateUpdate).toHaveBeenNthCalledWith(2, "task-1", "in-progress");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByTestId("status")).toHaveTextContent("in-progress");
    expect(screen.getByTestId("sort-hold")).toBeEmptyDOMElement();
  });
});
